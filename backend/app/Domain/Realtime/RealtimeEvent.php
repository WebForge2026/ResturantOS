<?php

namespace App\Domain\Realtime;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * Lightweight notification. Clients treat it as a hint and refetch authoritative state.
 */
class RealtimeEvent implements ShouldBroadcastNow
{
    public function __construct(
        public readonly ?int $branchId,
        public readonly ?string $guestToken,
        public readonly string $name,
        public readonly array $payload = [],
    ) {}

    public function broadcastOn(): array
    {
        $channels = [];
        if ($this->branchId) {
            $channels[] = new PrivateChannel('branch.'.$this->branchId);
        }
        if ($this->guestToken) {
            // Unguessable 32-char token → acts as a capability; payload contains no PII.
            $channels[] = new Channel('guest.'.$this->guestToken);
        }
        return $channels;
    }

    public function broadcastAs(): string
    {
        return $this->name;
    }

    public function broadcastWith(): array
    {
        return $this->payload + ['at' => now()->toIso8601String()];
    }
}
