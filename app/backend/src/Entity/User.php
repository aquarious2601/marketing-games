<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

/**
 * Someone who may configure the game (F07 R1).
 *
 * Named accounts rather than one shared password, so access can be given to
 * and taken from one person at a time, and so a change has a name against it
 * when an audit trail arrives.
 */
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: '`user`')]
#[ORM\UniqueConstraint(name: 'uniq_user_username', columns: ['username'])]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    /** F07 R2 */
    public const USERNAME_MIN_LENGTH = 3;
    public const USERNAME_MAX_LENGTH = 40;

    /**
     * F07 R4. Length is the only rule. Composition requirements reliably
     * produce `Password1!` and nothing stronger, while making people reuse
     * what they already have.
     */
    public const PASSWORD_MIN_LENGTH = 12;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: self::USERNAME_MAX_LENGTH, unique: true)]
    private string $username;

    /** The hash, never the password (F07 R3). */
    #[ORM\Column(length: 255)]
    private string $password = '';

    /** @var list<string> */
    #[ORM\Column(type: 'json')]
    private array $roles = [];

    #[ORM\Column(name: 'created_at')]
    private \DateTimeImmutable $createdAt;

    public function __construct(string $username)
    {
        $this->username = $username;
        $this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUsername(): string
    {
        return $this->username;
    }

    /** What Symfony uses to look the user up again on the next request. */
    public function getUserIdentifier(): string
    {
        return $this->username;
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function setPassword(string $hashedPassword): void
    {
        $this->password = $hashedPassword;
    }

    /**
     * @return list<string>
     */
    public function getRoles(): array
    {
        // Every account may do everything for now; a read-only role is its
        // own feature. ROLE_ADMIN is guaranteed so a user can never exist
        // without being able to sign in to something.
        $roles = $this->roles;
        $roles[] = 'ROLE_ADMIN';

        return array_values(array_unique($roles));
    }

    /**
     * @param list<string> $roles
     */
    public function setRoles(array $roles): void
    {
        $this->roles = $roles;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    /**
     * Nothing sensitive is held outside the hash, so there is nothing to
     * clear. Kept because the interface requires it.
     */
    public function eraseCredentials(): void
    {
    }
}
