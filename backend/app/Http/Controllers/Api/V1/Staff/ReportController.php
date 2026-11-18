<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\CheckItem;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\TableSession;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** All metrics are computed from persisted MySQL data — no synthetic numbers. */
class ReportController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        [$from, $to] = $this->range($request, $branch->timezone);

        $payments = Payment::where('branch_id', $branch->id)->where('status', 'captured')->whereBetween('created_at', [$from, $to])->get();
        $checkIds = $payments->pluck('check_id')->unique();
        $orders = Order::where('branch_id', $branch->id)->whereBetween('created_at', [$from, $to])->get();
        $soldItems = OrderItem::whereIn('order_id', $orders->where('status', '!=', 'cancelled')->pluck('id'))->where('status', '!=', 'cancelled')->get();

        $top = $soldItems->groupBy('product_id')->map(fn ($g) => [
            'product_id' => $g->first()->product_id,
            'name' => $g->first()->name,
            'quantity' => (int) $g->sum('quantity'),
            'revenue_cents' => (int) $g->sum('line_total_cents'),
        ])->sortByDesc('quantity')->take(8)->values();

        $byHour = collect(range(0, 23))->map(fn ($h) => ['hour' => sprintf('%02d:00', $h), 'sales_cents' => 0, 'orders' => 0])->keyBy('hour');
        foreach ($payments as $p) {
            $h = $p->created_at->setTimezone($branch->timezone)->format('H:00');
            $byHour[$h] = ['hour' => $h, 'sales_cents' => $byHour[$h]['sales_cents'] + $p->amount_cents, 'orders' => $byHour[$h]['orders']];
        }
        foreach ($orders as $o) {
            $h = $o->created_at->setTimezone($branch->timezone)->format('H:00');
            $row = $byHour[$h];
            $row['orders']++;
            $byHour[$h] = $row;
        }

        $byDay = $payments->groupBy(fn ($p) => $p->created_at->setTimezone($branch->timezone)->toDateString())
            ->map(fn ($g, $d) => ['date' => $d, 'sales_cents' => (int) $g->sum('amount_cents')])->sortKeys()->values();

        $sales = (int) $payments->sum('amount_cents');
        $settledChecks = $checkIds->count();

        return response()->json([
            'range' => ['from' => $from->toIso8601String(), 'to' => $to->toIso8601String()],
            'kpi' => [
                'sales_cents' => $sales,
                'tips_cents' => (int) $payments->sum('tip_cents'),
                'orders' => $orders->where('status', '!=', 'cancelled')->count(),
                'cancelled_orders' => $orders->where('status', 'cancelled')->count(),
                'avg_check_cents' => $settledChecks ? intdiv($sales, $settledChecks) : 0,
                'checks_paid' => $settledChecks,
                'active_tables' => TableSession::where('branch_id', $branch->id)->whereIn('status', TableSession::ACTIVE_STATUSES)->count(),
                'items_sold' => (int) $soldItems->sum('quantity'),
                'discounts_cents' => (int) \App\Models\Check::whereIn('id', $checkIds)->sum('discount_cents'),
                'voided_items' => CheckItem::whereNotNull('voided_at')->whereBetween('voided_at', [$from, $to])->whereHas('check', fn ($q) => $q->where('branch_id', $branch->id))->count(),
            ],
            'payments_by_method' => $payments->groupBy('method')->map(fn ($g, $m) => ['method' => $m, 'amount_cents' => (int) $g->sum('amount_cents'), 'count' => $g->count()])->values(),
            'top_items' => $top,
            'by_hour' => $byHour->values()->filter(fn ($r) => $r['orders'] > 0 || $r['sales_cents'] > 0)->values(),
            'by_day' => $byDay,
            'avg_prep_seconds' => $this->avgPrep($branch->id, $from, $to),
        ]);
    }

    public function exportSales(Request $request): StreamedResponse
    {
        $branch = $this->branch($request);
        [$from, $to] = $this->range($request, $branch->timezone);
        $payments = Payment::where('branch_id', $branch->id)->whereBetween('created_at', [$from, $to])->with('check.session.table', 'user:id,name')->orderBy('id')->get();
        return response()->streamDownload(function () use ($payments, $branch) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, ['Дата', 'Маса', 'Сметка', 'Метод', 'Сума EUR', 'Бакшиш EUR', 'Референция', 'Служител', 'Симулирано'], ';');
            foreach ($payments as $p) {
                fputcsv($out, [
                    $p->created_at->setTimezone($branch->timezone)->format('d.m.Y H:i'),
                    $p->check->session->table->label, $p->check_id, $p->method === 'cash' ? 'В брой' : 'Карта',
                    number_format($p->amount_cents / 100, 2, ',', ''), number_format($p->tip_cents / 100, 2, ',', ''),
                    $p->reference, $p->user?->name, $p->is_simulated ? 'да' : 'не',
                ], ';');
            }
            fclose($out);
        }, 'noar-sales-'.$from->format('Ymd').'-'.$to->format('Ymd').'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function audit(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $q = AuditLog::where('branch_id', $branch->id)->with('user:id,name')->latest('id');
        if ($request->filled('action')) {
            $q->where('action', 'like', $request->string('action').'%');
        }
        return response()->json(['data' => $q->limit(300)->get()->map(fn ($a) => [
            'id' => $a->id, 'action' => $a->action, 'actor' => $a->actor, 'user' => $a->user?->name,
            'subject_type' => $a->subject_type, 'subject_id' => $a->subject_id, 'meta' => $a->meta,
            'created_at' => $a->created_at?->toIso8601String(),
        ])]);
    }

    private function range(Request $request, string $tz): array
    {
        $from = $request->filled('from') ? CarbonImmutable::parse($request->string('from'), $tz)->startOfDay() : CarbonImmutable::now($tz)->startOfDay();
        $to = $request->filled('to') ? CarbonImmutable::parse($request->string('to'), $tz)->endOfDay() : CarbonImmutable::now($tz)->endOfDay();
        return [$from->utc(), $to->utc()];
    }

    private function avgPrep(int $branchId, $from, $to): ?int
    {
        $rows = \App\Models\PrepItem::whereHas('ticket', fn ($q) => $q->where('branch_id', $branchId))
            ->whereNotNull('ready_at')->whereBetween('ready_at', [$from, $to])->with('ticket:id,created_at')->get();
        if ($rows->isEmpty()) {
            return null;
        }
        return (int) round($rows->avg(fn ($r) => $r->ready_at->diffInSeconds($r->ticket->created_at, true)));
    }
}
