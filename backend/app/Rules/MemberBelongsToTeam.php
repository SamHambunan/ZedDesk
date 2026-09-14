<?php

namespace App\Rules;

use App\Models\OrganizationMember;
use App\Models\Team;
use Closure;
use Illuminate\Contracts\Validation\DataAwareRule;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Translation\PotentiallyTranslatedString;

class MemberBelongsToTeam implements DataAwareRule, ValidationRule
{
    /**
     * All of the data under validation.
     *
     * @var array<string, mixed>
     */
    protected array $data = [];

    public function __construct(
        protected int|string|Team|null $team = null
    ) {}

    /**
     * Set the data under validation.
     *
     * @param  array<string, mixed>  $data
     */
    public function setData(array $data): static
    {
        $this->data = $data;

        return $this;
    }

    /**
     * Run the validation rule.
     *
     * @param  Closure(string, ?string=): PotentiallyTranslatedString  $fail
     */
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (empty($value)) {
            return;
        }

        $teamId = $this->team instanceof Team
            ? $this->team->id
            : ($this->team ?? ($this->data['assigned_team_id'] ?? $this->data['team_id'] ?? null));

        if (empty($teamId)) {
            return;
        }

        $memberId = $value instanceof OrganizationMember ? $value->id : $value;

        $exists = DB::table('team_members')
            ->where('team_id', $teamId)
            ->where('organization_member_id', $memberId)
            ->exists();

        if (! $exists) {
            $fail('The selected organization member is not a member of the designated team.');
        }
    }
}
