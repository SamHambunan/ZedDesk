<?php

namespace App\Enums;

enum TicketMessageType: string
{
    case PUBLIC_REPLY = 'public_reply';
    case INTERNAL_NOTE = 'internal_note';
}
