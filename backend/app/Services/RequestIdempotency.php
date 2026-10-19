<?php

namespace App\Services;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RequestIdempotency
{
    public function key(Request $request): string
    {
        $key = $request->header('Idempotency-Key');
        $valid = is_string($key) && (
            preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $key)
            || preg_match('/^[0-9a-f]{64}$/i', $key)
            || preg_match('/^[A-Za-z0-9_-]{43,128}$/', $key)
        );

        if (! $valid) {
            throw ValidationException::withMessages(['idempotency_key' => 'A high-entropy Idempotency-Key is required.']);
        }

        return $key;
    }

    /** @param array<UploadedFile> $files */
    public function messageFingerprint(string $ticketId, string $messageType, string $body, ?string $status, array $files): string
    {
        return hash('sha256', json_encode([$ticketId, $messageType, $body, $status, $this->attachmentFingerprints($files)], JSON_THROW_ON_ERROR));
    }

    /** @param array<UploadedFile> $files */
    public function ticketCreationFingerprint(array $intake, array $files): string
    {
        return hash('sha256', json_encode([
            $intake['name'], $intake['email'], $intake['subject'], $intake['message'],
            $this->attachmentFingerprints($files),
        ], JSON_THROW_ON_ERROR));
    }

    /** @param array<UploadedFile> $files */
    private function attachmentFingerprints(array $files): array
    {
        return array_map(static fn (UploadedFile $file) => [
            'sha256' => hash_file('sha256', $file->getRealPath()),
            'name' => $file->getClientOriginalName(),
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
        ], $files);
    }

    /** The caller keeps this inside the transaction that writes all business effects. */
    public function run(RequestIdempotencyScope $scope, string $key, string $fingerprint, callable $mutate, callable $authorizeReplay): JsonResponse
    {
        $identity = $scope->identityForKey($key);

        $insert = function () use ($identity, $fingerprint): void {
            DB::table('request_idempotency')->insertOrIgnore($identity + [
                'fingerprint' => $fingerprint,
                'expires_at' => now()->addDay(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        };

        $insert();
        $record = DB::table('request_idempotency')->where($identity)->lockForUpdate()->first();

        if (now()->greaterThanOrEqualTo($record->expires_at)) {
            DB::table('request_idempotency')->where('id', $record->id)->delete();
            $insert();
            $record = DB::table('request_idempotency')->where($identity)->lockForUpdate()->first();
        }

        if ($record->fingerprint !== $fingerprint) {
            return response()->json(['message' => 'Idempotency-Key was already used for a different operation.'], 409);
        }

        if ($record->encrypted_response !== null) {
            $replayed = JsonResponse::fromJsonString(Crypt::decryptString($record->encrypted_response), (int) $record->response_status);
            $denial = $authorizeReplay($replayed);
            if ($denial instanceof JsonResponse) {
                return $denial;
            }

            return $replayed;
        }

        $result = $mutate();
        if ($result->getStatusCode() >= 400) {
            DB::table('request_idempotency')->where('id', $record->id)->delete();

            return $result;
        }

        DB::table('request_idempotency')->where('id', $record->id)->update([
            'response_status' => $result->getStatusCode(),
            'encrypted_response' => Crypt::encryptString($result->getContent()),
            'expires_at' => now()->addDay(),
            'updated_at' => now(),
        ]);

        return $result;
    }
}
