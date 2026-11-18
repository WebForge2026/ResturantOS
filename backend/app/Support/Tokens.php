<?php

namespace App\Support;

final class Tokens
{
    /** URL-safe, cryptographically random token. */
    public static function random(int $bytes = 24): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }
}
