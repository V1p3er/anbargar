from datetime import timedelta

from django.core import signing

ACCESS_TOKEN_EXPIRE_MINUTES = 30
TOKEN_SALT = "anbargar.api.access"


def create_access_token(user_id):
    payload = {"user_id": str(user_id)}
    return signing.dumps(payload, salt=TOKEN_SALT)


def decode_access_token(token):
    try:
        return signing.loads(
            token,
            salt=TOKEN_SALT,
            max_age=int(timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES).total_seconds()),
        )
    except signing.BadSignature:
        return None
