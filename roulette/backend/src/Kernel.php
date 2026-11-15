<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel
{
    use MicroKernelTrait;

    /**
     * The whole application runs in UTC.
     *
     * Every entity constructs its timestamps with an explicit UTC timezone
     * (F02 R9, F08 R8, F13 R21), but MySQL stores a naive datetime with no
     * zone attached — so Doctrine hydrates it back using PHP's default,
     * which on this machine is Europe/Berlin. A claim written at 15:30 UTC
     * read back as 15:30+01:00 is an hour in the past, and nothing about
     * the code looks wrong.
     *
     * Found by F13's claim test, which was the first to compare a value it
     * had just written against the same value reloaded. Setting the process
     * default makes the write and the read agree, which is the only way the
     * two can be the same instant.
     *
     * Display stays local: the admin tables render through `toLocaleString`
     * in the browser (F11 R7), so nobody at a counter reads UTC.
     */
    public function boot(): void
    {
        date_default_timezone_set('UTC');

        parent::boot();
    }
}
