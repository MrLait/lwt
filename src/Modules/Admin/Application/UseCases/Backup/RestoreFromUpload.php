<?php

/**
 * Restore From Upload Use Case
 *
 * PHP version 8.1
 *
 * @category Lwt
 * @package  Lwt\Modules\Admin\Application\UseCases\Backup
 * @author   HugoFara <hugo.farajallah@protonmail.com>
 * @license  Unlicense <http://unlicense.org/>
 * @link     https://hugofara.github.io/lwt/developer/api
 * @since    3.0.0
 */

declare(strict_types=1);

namespace Lwt\Modules\Admin\Application\UseCases\Backup;

use Lwt\Shared\Infrastructure\Globals;
use Lwt\Modules\Admin\Domain\BackupRepositoryInterface;

/**
 * Use case for restoring database from uploaded file.
 *
 * @since 3.0.0
 */
class RestoreFromUpload
{
    private BackupRepositoryInterface $repository;

    /**
     * Constructor.
     *
     * @param BackupRepositoryInterface $repository Backup repository
     */
    public function __construct(BackupRepositoryInterface $repository)
    {
        $this->repository = $repository;
    }

    /**
     * Execute the use case.
     *
     * @param array{name: string, type: string, tmp_name: string, error: int, size: int}|null $fileData
     *        Validated file data from InputValidator::getUploadedFile()
     *
     * @return array{success: bool, error: ?string}
     */
public function execute(?array $fileData): array
{
    if (!Globals::isBackupRestoreEnabled()) {
        return [
            'success' => false,
            'error' => 'Database restore is disabled. Set BACKUP_RESTORE_ENABLED=true in .env to enable.'
        ];
    }

    if ($fileData === null || empty($fileData['tmp_name'])) {
        return [
            'success' => false,
            'error' => 'No restore file specified'
        ];
    }

    $originalName = (string)($fileData['name'] ?? '');
    $tmpName = (string)$fileData['tmp_name'];

    try {
        $path = str_ends_with(strtolower($originalName), '.gz')
            ? 'compress.zlib://' . $tmpName
            : $tmpName;

        $handle = @fopen($path, 'r');
        if ($handle === false) {
            return [
                'success' => false,
                'error' => 'Restore file could not be opened'
            ];
        }

        $message = $this->repository->restoreFromHandle(
            $handle,
            $originalName !== '' ? $originalName : 'Database'
        );

        $success = str_starts_with($message, 'Success:');

        return [
            'success' => $success,
            'error' => $success ? null : $message,
        ];
    } catch (\Throwable $e) {
        return [
            'success' => false,
            'error' => 'Restore failed: ' . $e->getMessage(),
        ];
    }
}}
