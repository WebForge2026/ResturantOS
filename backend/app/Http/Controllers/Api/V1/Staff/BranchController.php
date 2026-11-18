<?php

namespace App\Http\Controllers\Api\V1\Staff;

use App\Domain\Onboarding\BranchProvisioner;
use App\Http\Controllers\Controller;
use App\Models\DiningTable;
use App\Models\FloorArea;
use App\Models\Station;
use App\Support\Audit;
use App\Support\DomainError;
use App\Support\Present;
use App\Support\Tokens;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BranchController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        return response()->json([
            'branch' => Present::branch($branch),
            'permissions' => $request->user()->permissionsFor($branch),
            'role' => $request->user()->membershipFor($branch)->role,
            'stations' => $branch->stations()->get(['id', 'name', 'code', 'display', 'color', 'sort']),
        ]);
    }

    public function updateIdentity(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'brand_name' => ['nullable', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:190'],
            'address' => ['nullable', 'string', 'max:190'],
            'city' => ['nullable', 'string', 'max:80'],
            'timezone' => ['sometimes', 'timezone'],
            'opening_hours' => ['nullable', 'array'],
            'opening_hours.*.day' => ['required', 'integer', 'between:1,7'],
            'opening_hours.*.open' => ['nullable', 'date_format:H:i'],
            'opening_hours.*.close' => ['nullable', 'date_format:H:i'],
            'opening_hours.*.closed' => ['boolean'],
        ]);
        $branch->update($data);
        Audit::record($branch, 'branch.updated', $branch, ['fields' => array_keys($data)]);
        return response()->json(['branch' => Present::branch($branch->fresh())]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'order_accept_mode' => ['sometimes', Rule::in(['auto', 'manual'])],
            'show_bgn' => ['sometimes', 'boolean'],
            'service_charge_bps' => ['sometimes', 'integer', 'between:0,2500'],
            'tips_enabled' => ['sometimes', 'boolean'],
            'require_shift_for_payments' => ['sometimes', 'boolean'],
            'stock_reservation_enabled' => ['sometimes', 'boolean'],
            'brand_accent' => ['sometimes', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        $branch->update(['settings' => array_merge($branch->resolvedSettings(), $data)]);
        Audit::record($branch, 'settings.updated', $branch, $data);
        return response()->json(['branch' => Present::branch($branch->fresh())]);
    }

    public function updateOnboarding(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'completed_step' => ['nullable', Rule::in(BranchProvisioner::ONBOARDING_STEPS)],
            'current' => ['nullable', Rule::in(BranchProvisioner::ONBOARDING_STEPS)],
            'finish' => ['boolean'],
        ]);
        $state = $branch->onboarding ?? ['completed_steps' => []];
        if (! empty($data['completed_step'])) {
            $state['completed_steps'] = array_values(array_unique([...$state['completed_steps'] ?? [], $data['completed_step']]));
        }
        if (! empty($data['current'])) {
            $state['current'] = $data['current'];
        }
        $branch->onboarding = $state;
        if (! empty($data['finish'])) {
            $branch->onboarding_completed_at = now();
        }
        $branch->save();
        return response()->json(['branch' => Present::branch($branch)]);
    }

    // ---------------------------------------------------------------- floor plan

    public function floor(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        return response()->json([
            'areas' => $branch->areas()->get(['id', 'name', 'kind', 'width', 'height', 'sort']),
            'tables' => $branch->tables()->orderBy('number')->get()->map(fn (DiningTable $t) => [
                'id' => $t->id, 'number' => $t->number, 'label' => $t->label, 'seats' => $t->seats, 'shape' => $t->shape,
                'x' => $t->x, 'y' => $t->y, 'width' => $t->width, 'height' => $t->height, 'rotation' => $t->rotation,
                'floor_area_id' => $t->floor_area_id, 'is_active' => $t->is_active,
            ]),
        ]);
    }

    /** Bulk save of the floor-plan editor state (areas + tables). Client ids for new rows are negative. */
    public function saveFloor(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'areas' => ['required', 'array', 'min:1', 'max:20'],
            'areas.*.id' => ['required', 'integer'],
            'areas.*.name' => ['required', 'string', 'max:60'],
            'areas.*.kind' => ['required', Rule::in(['indoor', 'terrace', 'bar', 'private'])],
            'tables' => ['present', 'array', 'max:300'],
            'tables.*.id' => ['required', 'integer'],
            'tables.*.area_id' => ['required', 'integer'],
            'tables.*.number' => ['required', 'integer', 'min:1', 'max:9999', 'distinct'],
            'tables.*.label' => ['nullable', 'string', 'max:30'],
            'tables.*.seats' => ['required', 'integer', 'min:1', 'max:40'],
            'tables.*.shape' => ['required', Rule::in(['round', 'square', 'rect'])],
            'tables.*.x' => ['required', 'integer', 'between:0,5000'],
            'tables.*.y' => ['required', 'integer', 'between:0,5000'],
            'tables.*.width' => ['required', 'integer', 'between:40,400'],
            'tables.*.height' => ['required', 'integer', 'between:40,400'],
            'tables.*.rotation' => ['required', 'integer', 'between:-360,360'],
        ]);

        DB::transaction(function () use ($branch, $data) {
            $areaMap = [];
            $keepAreas = [];
            foreach ($data['areas'] as $i => $a) {
                $area = $a['id'] > 0 ? $this->own(FloorArea::find($a['id']), $branch) : new FloorArea(['branch_id' => $branch->id]);
                $area->fill(['name' => $a['name'], 'kind' => $a['kind'], 'sort' => $i])->save();
                $areaMap[$a['id']] = $area->id;
                $keepAreas[] = $area->id;
            }
            // Free all numbers first so tables can be renumbered/swapped without unique clashes.
            DiningTable::where('branch_id', $branch->id)->update(['number' => DB::raw('200000 + id')]);
            $keepTables = [];
            foreach ($data['tables'] as $t) {
                $attrs = [
                    'floor_area_id' => $areaMap[$t['area_id']] ?? throw new DomainError('invalid_area', 'Невалидна зона.'),
                    'number' => $t['number'],
                    'label' => $t['label'] ?: sprintf('Маса %02d', $t['number']),
                    'seats' => $t['seats'], 'shape' => $t['shape'], 'x' => $t['x'], 'y' => $t['y'],
                    'width' => $t['width'], 'height' => $t['height'], 'rotation' => $t['rotation'], 'is_active' => true,
                ];
                if ($t['id'] > 0) {
                    $table = $this->own(DiningTable::find($t['id']), $branch);
                    $table->update($attrs);
                } else {
                    $table = BranchProvisioner::newTable($branch, $attrs);
                }
                $keepTables[] = $table->id;
            }
            $removed = $branch->tables()->whereNotIn('id', $keepTables)->get();
            foreach ($removed as $table) {
                $hasHistory = $table->sessions()->exists();
                if ($table->sessions()->whereIn('status', ['open', 'bill_requested', 'settled'])->exists()) {
                    throw new DomainError('table_in_use', "{$table->label} има отворена сметка и не може да бъде премахната.", 409);
                }
                // keep historical tables (orders reference them) but deactivate and free their number
                $hasHistory ? $table->update(['is_active' => false, 'number' => 100000 + $table->id, 'floor_area_id' => null]) : $table->delete();
            }
            $branch->areas()->whereNotIn('id', $keepAreas)->delete();
        });
        Audit::record($branch, 'floor.saved', $branch, ['tables' => count($data['tables'])]);
        return $this->floor($request);
    }

    public function qrCodes(Request $request): JsonResponse
    {
        $branch = $this->branch($request);
        return response()->json(['data' => $branch->tables()->where('is_active', true)->orderBy('number')->get()->map(fn ($t) => [
            'id' => $t->id, 'number' => $t->number, 'label' => $t->label, 'qr_token' => $t->qr_token,
            'qr_rotated_at' => $t->qr_rotated_at?->toIso8601String(),
        ])]);
    }

    public function rotateQr(Request $request, int $tableId): JsonResponse
    {
        $branch = $this->branch($request);
        $table = $this->own(DiningTable::find($tableId), $branch);
        $table->update(['qr_token' => Tokens::random(24), 'qr_rotated_at' => now()]);
        Audit::record($branch, 'qr.rotated', $table);
        return response()->json(['id' => $table->id, 'qr_token' => $table->qr_token]);
    }

    // ---------------------------------------------------------------- stations

    public function saveStation(Request $request, ?int $stationId = null): JsonResponse
    {
        $branch = $this->branch($request);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'code' => ['required', 'alpha_dash', 'max:32', Rule::unique('stations')->where('branch_id', $branch->id)->ignore($stationId)],
            'display' => ['required', Rule::in(['kitchen', 'bar'])],
            'color' => ['nullable', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ]);
        $station = $stationId ? $this->own(Station::find($stationId), $branch) : new Station(['branch_id' => $branch->id, 'sort' => $branch->stations()->count()]);
        $station->fill($data)->save();
        Audit::record($branch, 'station.saved', $station);
        return response()->json(['station' => $station]);
    }
}
