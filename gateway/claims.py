from dataclasses import dataclass

from roles import normalize_roles

__all__ = ["UserClaims", "normalize_roles"]


@dataclass
class UserClaims:
    user_id: str
    email: str | None
    roles: list[str]
    team: str
    group: str
    plan: str

    def to_jwt_claims(self) -> dict:
        """Application JWT claim shape (gateway trust boundary)."""
        return {
            "sub": self.user_id,
            "email": self.email or "",
            "roles": self.roles,
            "team": self.team,
            "group": self.group,
            "plan": self.plan,
        }

    def to_user_dict(self) -> dict:
        claims = self.to_jwt_claims()
        return {
            "user_id": self.user_id,
            "email": self.email,
            **claims,
            "jwt_claims": claims,
        }
