<?php

namespace App\Services;

class RequestIdempotencyScope
{
    public function __construct(
        public readonly int $organizationId,
        public readonly string $actorType,
        public readonly string $actorId,
        public readonly string $operation,
        public readonly string $targetId,
    ) {}

    /** @return array<string, int|string> */
    public function identityForKey(string $key): array
    {
        return [
            'organization_id' => $this->organizationId,
            'actor_type' => $this->actorType,
            'actor_id' => $this->actorId,
            'operation' => $this->operation,
            'target_id' => $this->targetId,
            'key_hash' => hash('sha256', $key),
        ];
    }
}
