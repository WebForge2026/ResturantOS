<?php

namespace App\Support;

use RuntimeException;

/** Business-rule violation rendered as {error:{code,message}} with a Bulgarian message. */
class DomainError extends RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $status = 422)
    {
        parent::__construct($message);
    }
}
