# Domain rules

## Separate concepts
table session → orders → order items → prep tickets/items (per station) · checks → check items → payments → allocations · stock movements.

## Order statuses (validated transitions in `Order::TRANSITIONS`)
`pending → accepted → in_preparation → partially_ready → ready → served → completed`, and `cancelled` from any non-final status.
After acceptance the aggregate is **derived** from item statuses:
- all items served → `served`
- all ready or served → `ready`
- some ready or served → `partially_ready`
- any preparing → `in_preparation`
- otherwise → `accepted`

`completed` is set once the session's checks are settled.

## Preparation (per item and station)
`queued ⇄ preparing → ready (⇄ preparing as an undo) → handed_off`. `handed_off` happens only when the waiter serves.
**Ready ≠ served:** only ready items can be served. Kitchen users can change kitchen stations only, and bar users the bar only.

## Acceptance and checks
- QR orders are auto-accepted or wait for staff, per the branch setting `order_accept_mode`.
- **On acceptance** the immutable price snapshots are added to the session's open check immediately (not when the food is ready), tickets are created per station, and stock is reserved.
- Prices are always recomputed on the server from the live menu, variants and modifiers. Client totals are previews.
- Money is integer euro cents. BGN is informative only (1 € = 1,95583 лв.).

## Payments (simulated)
- Modes: `full`, `amount` (split by amount) and `items` (pays the unpaid remainder of chosen lines).
- Discounts and the service charge are settled with the final payment.
- Every payment is idempotent (`Idempotency-Key`) and takes a row lock on the check.
- A check settles when paid ≥ total. When every check with items is settled, the session becomes `settled`.
- **Clearing** a table is a separate step. It requires every check to be paid and no unserved or unaccepted orders.

## Split / merge
You can split only a check with no payments and no discount. Merging requires the source check to have no payments.

## Stock
| Event | Movement | Effect |
|---|---|---|
| Accept | `reserve` | `reserved` goes up |
| Item marked **ready** | `consume` | `on_hand` goes down (this is the explicit consumption event), the reservation is cleared |
| Cancel before ready | `release` | the reservation is freed |

- Each movement has a unique `dedupe_key` (type:order_item:ingredient), so retries never double-count.
- Products without a recipe create no movements; the system never invents usage.
- Low stock: an ingredient crossing its minimum emits `stock.low`. Products flagged `auto_unavailable_on_low_stock` are hidden.
- Reorder suggestion is a simple rule (refill to 2× the minimum, or the reorder quantity). It is not AI.

## Tenancy
Every private route is `/branches/{branch}/…` behind the `branch` middleware. Nested ids are checked against the branch (`own()`).
Foreign resources return 404. Suspended organisations cannot use staff routes or QR ordering.
