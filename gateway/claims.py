from dataclasses import dataclass


@dataclass
class UserClaims:
    user_id: str
    email: str | None
    role: str
    team: str
    group: str
    plan: str

    def to_jwt_claims(self) -> dict[str, str]:
        """Application JWT claim shape (gateway trust boundary)."""
        return {
            "sub": self.user_id,
            "email": self.email or "",
            "role": self.role,
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
            # backward compatibility
            "roles": [self.role],
        }
