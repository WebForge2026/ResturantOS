<?php

namespace App\Domain\Billing;

use App\Domain\Orders\OrderService;
use App\Domain\Realtime\Realtime;
use App\Models\Check;
use App\Models\CheckItem;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\PosShift;
use App\Models\ServiceRequest;
use App\Models\TableSession;
use App\Models\User;
use App\Support\Audit;
use App\Support\DomainError;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * SIMULATED payments only. No card terminal, bank or fiscal device is contacted.
 * Modes:
 *   full   – pay the remaining due
 *   amount – pay an arbitrary amount (split by amount)
 *   items  – pay the unpaid remainder of selected check items (split by items)
 */
class PaymentService
{
    public function __construct(private CheckService $checks, private OrderService $orders) {}

    public function pay(Check $check, array $data, User $user): Payment
    {
        return DB::transaction(function () use ($check, $data, $user) {
            $check = Check::whereKey($check->id)->lockForUpdate()->firstOrFail();
            $this->checks->assertOpen($check);
            $branch = $check->session->branch;
            $this->checks->recalc($check);
            $due = $check->dueCents();
            if ($due <= 0) {
                throw new DomainError('nothing_due', 'Няма дължима сума по сметката.', 409);
            }

            $method = $data['method'];
            $mode = $data['mode'] ?? 'full';
            $allocations = [];

            if ($mode === 'items') {
                $items = CheckItem::where('check_id', $check->id)->whereNull('voided_at')->whereIn('id', $data['check_item_ids'] ?? [])->get();
                if ($items->isEmpty()) {
                    throw new DomainError('invalid_items', 'Изберете артикули от тази сметка.');
                }
                $amount = 0;
                foreach ($items as $item) {
                    $remaining = $item->total_cents - $this->checks->itemPaidCents($item);
                    if ($remaining > 0) {
                        $allocations[] = ['check_item_id' => $item->id, 'amount_cents' => $remaining];
                        $amount += $remaining;
                    }
                }
                if ($amount === 0) {
                    throw new DomainError('items_paid', 'Избраните артикули вече са платени.', 409);
                }
                $amount = min($amount, $due);
            } elseif ($mode === 'amount') {
                $amount = (int) ($data['amount_cents'] ?? 0);
                if ($amount < 1 || $amount > $due) {
                    throw new DomainError('invalid_amount', 'Сумата трябва да е между 0,01 € и дължимата сума.');
                }
                $allocations[] = ['check_item_id' => null, 'amount_cents' => $amount];
            } else {
                $amount = $due;
                $allocations[] = ['check_item_id' => null, 'amount_cents' => $amount];
            }

            $tip = max(0, (int) ($data['tip_cents'] ?? 0));
            if ($tip > 0 && ! $branch->setting('tips_enabled')) {
                throw new DomainError('tips_disabled', 'Бакшишите са изключени в настройките.');
            }
            $tendered = null;
            $change = 0;
            if ($method === 'cash') {
                $tendered = (int) ($data['tendered_cents'] ?? ($amount + $tip));
                if ($tendered < $amount + $tip) {
                    throw new DomainError('insufficient_tendered', 'Получената сума е по-малка от дължимата.');
                }
                $change = $tendered - $amount - $tip;
            }

            $shift = PosShift::where('branch_id', $branch->id)->where('status', 'open')->latest('id')->first();
            if (! $shift && $branch->setting('require_shift_for_payments')) {
                throw new DomainError('no_open_shift', 'Отворете касова смяна преди плащане.', 409);
            }

            $payment = Payment::create([
                'branch_id' => $branch->id,
                'check_id' => $check->id,
                'pos_shift_id' => $shift?->id,
                'user_id' => $user->id,
                'method' => $method,
                'mode' => $mode,
                'amount_cents' => $amount,
                'tip_cents' => $tip,
                'tendered_cents' => $tendered,
                'change_cents' => $change,
                'status' => 'captured',
                'reference' => 'SIM-'.Str::upper(Str::random(8)),
                'is_simulated' => true,
            ]);
            foreach ($allocations as $a) {
                PaymentAllocation::create($a + ['payment_id' => $payment->id]);
            }

            $check->tip_cents += $tip;
            $this->checks->recalc($check);
            if ($check->paid_cents >= $check->total_cents) {
                $check->update(['status' => 'settled', 'settled_at' => now()]);
                $this->afterCheckSettled($check, $user);
            }
            Audit::record($branch, 'payment.captured', $payment, ['check_id' => $check->id, 'amount' => $amount, 'method' => $method, 'simulated' => true], $user->id);
            Realtime::emit($branch->id, 'payment.captured', ['check_id' => $check->id, 'session_id' => $check->table_session_id, 'table_id' => $check->session->dining_table_id]);
            return $payment;
        });
    }

    private function afterCheckSettled(Check $check, User $user): void
    {
        $session = TableSession::whereKey($check->table_session_id)->lockForUpdate()->firstOrFail();
        $openWithItems = Check::where('table_session_id', $session->id)->where('status', 'open')->get()
            ->filter(fn (Check $c) => $c->activeItems()->exists());
        if ($openWithItems->isNotEmpty()) {
            return;
        }
        $session->update(['status' => 'settled', 'settled_at' => now()]);
        ServiceRequest::where('table_session_id', $session->id)->where('type', 'bill')->where('status', '!=', 'done')
            ->update(['status' => 'done', 'done_at' => now(), 'handled_by' => $user->id]);
        $this->orders->completeServedOrders($session);
        Realtime::emit($session->branch_id, 'table.updated', ['table_id' => $session->dining_table_id]);
        Realtime::emit(null, 'session.updated', ['status' => 'settled'], $session->guest_token);
    }
}
