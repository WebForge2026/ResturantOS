<?php

namespace App\Domain\Billing;

use App\Domain\Realtime\Realtime;
use App\Models\Check;
use App\Models\CheckItem;
use App\Models\OrderItem;
use App\Models\TableSession;
use App\Models\User;
use App\Support\Audit;
use App\Support\DomainError;
use Illuminate\Support\Facades\DB;

/**
 * Open checks accumulate accepted order items immediately (price snapshots), independent
 * of preparation progress. All amounts are integer cents.
 */
class CheckService
{
    public function openCheckFor(TableSession $session): Check
    {
        $check = Check::where('table_session_id', $session->id)->where('status', 'open')->orderBy('seq')->lockForUpdate()->first();
        if ($check) {
            return $check;
        }
        $seq = (int) Check::where('table_session_id', $session->id)->max('seq') + 1;
        return Check::create(['branch_id' => $session->branch_id, 'table_session_id' => $session->id, 'seq' => $seq, 'status' => 'open']);
    }

    public function addOrderItem(Check $check, OrderItem $item): CheckItem
    {
        return CheckItem::firstOrCreate(
            ['order_item_id' => $item->id],
            [
                'check_id' => $check->id,
                'name' => $item->name.($item->modifiers ? ' ('.collect($item->modifiers)->pluck('name')->join(', ').')' : ''),
                'quantity' => $item->quantity,
                'unit_price_cents' => $item->unit_price_cents,
                'vat_rate_bps' => $item->vat_rate_bps,
                'total_cents' => $item->line_total_cents,
            ],
        );
    }

    public function recalc(Check $check): Check
    {
        $branch = $check->session->branch;
        $subtotal = (int) CheckItem::where('check_id', $check->id)->whereNull('voided_at')->sum('total_cents');
        $discount = min($check->discount_cents, $subtotal);
        $serviceBps = (int) $branch->setting('service_charge_bps');
        $service = intdiv(($subtotal - $discount) * $serviceBps + 5000, 10000);
        $paid = (int) $check->payments()->where('status', 'captured')->sum('amount_cents');

        $check->fill([
            'subtotal_cents' => $subtotal,
            'discount_cents' => $discount,
            'service_charge_cents' => $service,
            'total_cents' => $subtotal - $discount + $service,
            'paid_cents' => $paid,
        ]);
        $check->version++;
        $check->save();
        Realtime::emit($check->branch_id, 'check.updated', ['check_id' => $check->id, 'session_id' => $check->table_session_id]);
        return $check;
    }

    public function applyDiscount(Check $check, string $type, int $value, string $reason, User $user): Check
    {
        return DB::transaction(function () use ($check, $type, $value, $reason, $user) {
            $check = Check::whereKey($check->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($check);
            $subtotal = (int) $check->activeItems()->sum('total_cents');
            $cents = match ($type) {
                'percent' => $value < 0 || $value > 100
                    ? throw new DomainError('invalid_discount', 'Процентът трябва да е между 0 и 100.')
                    : intdiv($subtotal * $value + 50, 100),
                'amount' => max(0, min($value, $subtotal)),
                default => throw new DomainError('invalid_discount', 'Невалиден тип отстъпка.'),
            };
            $alreadyPaidAfter = $check->paid_cents > $subtotal - $cents;
            if ($alreadyPaidAfter) {
                throw new DomainError('discount_exceeds_due', 'Отстъпката надвишава неплатената сума.');
            }
            $check->discount_cents = $cents;
            $check->discount_reason = $reason;
            $check->discount_by = $user->id;
            $this->recalc($check);
            Audit::record($check->session->branch, 'check.discount', $check, ['type' => $type, 'value' => $value, 'cents' => $cents, 'reason' => $reason]);
            return $check;
        });
    }

    /** Move unpaid items into a new check of the same session. */
    public function split(Check $check, array $checkItemIds, User $user): Check
    {
        return DB::transaction(function () use ($check, $checkItemIds, $user) {
            $check = Check::whereKey($check->id)->lockForUpdate()->firstOrFail();
            $this->assertOpen($check);
            if ($check->paid_cents > 0 || $check->discount_cents > 0) {
                throw new DomainError('split_after_payment', 'Сметка с плащания или отстъпка не може да се разделя. Използвайте плащане по артикули.');
            }
            $items = CheckItem::where('check_id', $check->id)->whereNull('voided_at')->whereIn('id', $checkItemIds)->get();
            if ($items->isEmpty() || $items->count() !== count(array_unique($checkItemIds))) {
                throw new DomainError('invalid_items', 'Избраните артикули не принадлежат на тази сметка.');
            }
            if ($items->count() === $check->activeItems()->count()) {
                throw new DomainError('split_all', 'Не можете да преместите всички артикули — оставете поне един.');
            }
            $seq = (int) Check::where('table_session_id', $check->table_session_id)->max('seq') + 1;
            $new = Check::create(['branch_id' => $check->branch_id, 'table_session_id' => $check->table_session_id, 'seq' => $seq, 'status' => 'open']);
            CheckItem::whereIn('id', $items->pluck('id'))->update(['check_id' => $new->id]);
            $this->recalc($check);
            $this->recalc($new);
            Audit::record($check->session->branch, 'check.split', $check, ['new_check_id' => $new->id, 'items' => $items->pluck('id')], $user->id);
            return $new;
        });
    }

    public function merge(Check $target, Check $source, User $user): Check
    {
        return DB::transaction(function () use ($target, $source, $user) {
            $ids = collect([$target->id, $source->id])->sort()->values();
            $locked = Check::whereIn('id', $ids)->lockForUpdate()->get()->keyBy('id');
            $target = $locked[$target->id];
            $source = $locked[$source->id];
            if ($target->table_session_id !== $source->table_session_id || $target->id === $source->id) {
                throw new DomainError('invalid_merge', 'Сметките трябва да са различни и от една и съща маса.');
            }
            $this->assertOpen($target);
            $this->assertOpen($source);
            if ($source->paid_cents > 0) {
                throw new DomainError('merge_after_payment', 'Сметка с плащания не може да се обединява.');
            }
            CheckItem::where('check_id', $source->id)->update(['check_id' => $target->id]);
            $source->update(['status' => 'void', 'discount_cents' => 0]);
            $this->recalc($source);
            $this->recalc($target);
            Audit::record($target->session->branch, 'check.merge', $target, ['source_check_id' => $source->id], $user->id);
            return $target;
        });
    }

    public function itemPaidCents(CheckItem $item): int
    {
        return (int) $item->allocations()->sum('amount_cents');
    }

    public function assertOpen(Check $check): void
    {
        if ($check->status !== 'open') {
            throw new DomainError('check_closed', 'Сметката вече е приключена.', 409);
        }
    }
}
