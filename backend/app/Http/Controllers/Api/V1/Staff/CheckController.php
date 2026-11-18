<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Domain\Billing\CheckService;
use App\Domain\Billing\PaymentService;
use App\Domain\Orders\OrderService;
use App\Http\Controllers\Controller;
use App\Models\Check;
use App\Models\CheckItem;
use App\Models\Payment;
use App\Models\PosShift;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Idempotency;
use App\Support\Present;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class CheckController extends Controller
{
    public function __construct(private CheckService $checks, private PaymentService $payments, private OrderService $orders) {}

    public function show(Request $request, int $checkId): JsonResponse
    {
        $check = $this->own(Check::find($checkId), $this->branch($request));
        return response()->json(['check' => Present::check($check)]);
    }

    public function discount(Request $request, int $checkId): JsonResponse
    {
        $check = $this->own(Check::find($checkId), $this->branch($request));
        $data = $request->validate([
            'type' => ['required', Rule::in(['percent', 'amount'])],
            'value' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'max:200'],
        ]);
        $this->checks->applyDiscount($check, $data['type'], $data['value'], $data['reason'], $request->user());
        return response()->json(['check' => Present::check($check->fresh())]);
    }

    /** Void a check line (authorized). Cancels its preparation if not yet ready/served. */
    public function voidItem(Request $request, int $checkItemId): JsonResponse
    {
        $branch = $this->branch($request);
        $item = CheckItem::with('check')->find($checkItemId);
        $this->own($item?->check, $branch);
        $data = $request->validate(['reason' => ['required', 'string', 'max:200']]);

        DB::transaction(function () use ($item, $data, $request, $branch) {
            $check = Check::whereKey($item->check_id)->lockForUpdate()->firstOrFail();
            $this->checks->assertOpen($check);
            if ($item->voided_at) {
                return;
            }
            if ($this->checks->itemPaidCents($item) > 0) {
                throw new DomainError('item_paid', 'Артикулът вече е платен.', 409);
            }
            $orderItem = $item->orderItem;
            if ($orderItem && ! in_array($orderItem->status, ['served', 'cancelled', 'ready'], true)) {
                $this->orders->cancelItem($orderItem, $request->user(), $data['reason']);
            } else {
                $item->update(['voided_at' => now(), 'voided_by' => $request->user()->id, 'void_reason' => $data['reason']]);
                $this->checks->recalc($check);
                Audit::record($branch, 'check_item.voided', $item, ['reason' => $data['reason']]);
            }
        });
        return response()->json(['check' => Present::check($item->check->fresh())]);
    }

    public function split(Request $request, int $checkId): JsonResponse
    {
        $check = $this->own(Check::find($checkId), $this->branch($request));
        $data = $request->validate(['check_item_ids' => ['required', 'array', 'min:1'], 'check_item_ids.*' => ['integer']]);
        $new = $this->checks->split($check, $data['check_item_ids'], $request->user());
        return response()->json(['check' => Present::check($check->fresh()), 'new_check' => Present::check($new)], 201);
    }

    public function merge(Request $request, int $checkId): JsonResponse
    {
        $branch = $this->branch($request);
        $target = $this->own(Check::find($checkId), $branch);
        $data = $request->validate(['source_check_id' => ['required', 'integer']]);
        $source = $this->own(Check::find($data['source_check_id']), $branch);
        $this->checks->merge($target, $source, $request->user());
        return response()->json(['check' => Present::check($target->fresh())]);
    }

    public function pay(Request $request, int $checkId): JsonResponse
    {
        $check = $this->own(Check::find($checkId), $this->branch($request));
        $data = $request->validate([
            'method' => ['required', Rule::in(['cash', 'card'])],
            'mode' => ['required', Rule::in(['full', 'amount', 'items'])],
            'amount_cents' => ['required_if:mode,amount', 'nullable', 'integer', 'min:1'],
            'check_item_ids' => ['required_if:mode,items', 'array'],
            'check_item_ids.*' => ['integer'],
            'tendered_cents' => ['nullable', 'integer', 'min:0'],
            'tip_cents' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ]);
        return Idempotency::handle($request, 'payment:'.$check->id, function () use ($check, $data, $request) {
            $payment = $this->payments->pay($check, $data, $request->user());
            return [201, ['payment' => [
                'id' => $payment->id, 'amount_cents' => $payment->amount_cents, 'change_cents' => $payment->change_cents,
                'reference' => $payment->reference, 'is_simulated' => true,
            ], 'check' => Present::check($check->fresh())]];
        }, required: true);
    }

    /** Receipt preview (informational; NOT a fiscal receipt). */
    public function receipt(Request $request, int $checkId): JsonResponse
    {
        $branch = $this->branch($request);
        $check = $this->own(Check::with('session.table')->find($checkId), $branch);
        return response()->json([
            'restaurant' => ['name' => $branch->brand_name ?: $branch->name, 'address' => $branch->address, 'city' => $branch->city, 'phone' => $branch->phone],
            'table' => $check->session->table->label,
            'check' => Present::check($check),
            'printed_at' => now($branch->timezone)->format('d.m.Y H:i'),
            'disclaimer' => 'Информативна разписка — не е фискален бон. Плащанията са симулирани.',
        ]);
    }

    // ---------------------------------------------------------------- shifts

    public function currentShift(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $shift = PosShift::where('branch_id', $branch->id)->where('status', 'open')->with('opener:id,name')->latest('id')->first();
        return response()->json(['shift' => $shift ? $this->shiftSummary($shift) : null]);
    }

    public function shifts(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        return response()->json(['data' => PosShift::where('branch_id', $branch->id)->with('opener:id,name')->latest('id')->limit(30)->get()->map(fn ($s) => $this->shiftSummary($s))]);
    }

    public function openShift(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate(['opening_float_cents' => ['required', 'integer', 'min:0', 'max:10000000']]);
        $shift = DB::transaction(function () use ($branch, $data, $request) {
            \App\Models\Branch::whereKey($branch->id)->lockForUpdate()->first();
            if (PosShift::where('branch_id', $branch->id)->where('status', 'open')->exists()) {
                throw new DomainError('shift_open', 'Вече има отворена касова смяна.', 409);
            }
            return PosShift::create(['branch_id' => $branch->id, 'opened_by' => $request->user()->id, 'opening_float_cents' => $data['opening_float_cents'], 'opened_at' => now(), 'status' => 'open']);
        });
        Audit::record($branch, 'shift.opened', $shift, $data);
        return response()->json(['shift' => $this->shiftSummary($shift)], 201);
    }

    public function closeShift(Request $request, int $shiftId): JsonResponse
    {
        $branch = $this->branch($request);
        $shift = $this->own(PosShift::find($shiftId), $branch);
        $data = $request->validate(['counted_cash_cents' => ['required', 'integer', 'min:0'], 'note' => ['nullable', 'string', 'max:500']]);
        if ($shift->status !== 'open') {
            throw new DomainError('shift_closed', 'Смяната вече е затворена.', 409);
        }
        $summary = $this->shiftSummary($shift);
        $shift->update([
            'status' => 'closed', 'closed_at' => now(), 'closed_by' => $request->user()->id,
            'expected_cash_cents' => $summary['expected_cash_cents'], 'counted_cash_cents' => $data['counted_cash_cents'],
            'difference_cents' => $data['counted_cash_cents'] - $summary['expected_cash_cents'], 'close_note' => $data['note'] ?? null,
        ]);
        Audit::record($branch, 'shift.closed', $shift, ['difference_cents' => $shift->difference_cents]);
        return response()->json(['shift' => $this->shiftSummary($shift->fresh())]);
    }

    private function shiftSummary(PosShift $shift): array
    {
        $payments = Payment::where('pos_shift_id', $shift->id)->where('status', 'captured')->get();
        $cash = (int) $payments->where('method', 'cash')->sum('amount_cents') + (int) $payments->where('method', 'cash')->sum('tip_cents');
        return [
            'id' => $shift->id,
            'status' => $shift->status,
            'opened_by' => $shift->opener?->name,
            'opened_at' => $shift->opened_at->toIso8601String(),
            'closed_at' => $shift->closed_at?->toIso8601String(),
            'opening_float_cents' => $shift->opening_float_cents,
            'cash_sales_cents' => (int) $payments->where('method', 'cash')->sum('amount_cents'),
            'card_sales_cents' => (int) $payments->where('method', 'card')->sum('amount_cents'),
            'tips_cents' => (int) $payments->sum('tip_cents'),
            'payments_count' => $payments->count(),
            'expected_cash_cents' => $shift->expected_cash_cents ?? ($shift->opening_float_cents + $cash),
            'counted_cash_cents' => $shift->counted_cash_cents,
            'difference_cents' => $shift->difference_cents,
        ];
    }
}
