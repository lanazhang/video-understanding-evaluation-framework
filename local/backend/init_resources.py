"""Create the local SQLite database and file directories. Idempotent; app.py also does this on startup."""
import config  # noqa: F401  (loads env)
from store import schema
from store.local_s3 import files_root
from store.sqlite_table import data_dir


def main():
    schema.setup()
    (files_root() / config.BUCKET).mkdir(parents=True, exist_ok=True)
    print(f"data dir: {data_dir()}")


if __name__ == "__main__":
    main()
