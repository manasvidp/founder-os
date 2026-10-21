# Cleanup: delete all test_*@example.com users (except provided sample account test_w2) and their records in every collection
import os, asyncio, re
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
KEEP = {"test_w2@example.com"}


async def main():
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    users = await db.users.find({"email": {"$regex": r"^test_.*@example\.com$"}}, {"_id": 0, "user_id": 1, "email": 1}).to_list(10000)
    uids = [u["user_id"] for u in users if u["email"] not in KEEP]
    colls = await db.list_collection_names()
    total = 0
    for c in colls:
        if c == "users":
            continue
        r = await db[c].delete_many({"user_id": {"$in": uids}})
        total += r.deleted_count
    await db.login_attempts.delete_many({"identifier": {"$regex": r"^login:test_.*@example\.com$", "$nin": [f"login:{k}" for k in KEEP]}})
    await db.cron_runs.delete_many({"run_id": {"$regex": "^TEST-"}})
    r = await db.users.delete_many({"user_id": {"$in": uids}})
    print(f"deleted users={r.deleted_count} records={total}")


asyncio.run(main())
