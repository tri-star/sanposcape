from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    """request-scoped session を使う UserService を供給する。"""
    return UserService(db, UserRepository(db))
