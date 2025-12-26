# Repository Guidelines

## Project Structure & Module Organization
This is a Django project with two primary apps. Core models and API live in `home`, and web authentication lives in `auth`. Templates are under each app (`home/templates/home`, `auth/templates/auth`), while static assets are bundled under `home/static/home/files` and `auth/static/auth/files`. The Django project settings are in `anbargar/`. Local media uploads go to `uploads/`, and the development database is `db.sqlite3`.

## Build, Test, and Development Commands
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
python manage.py test
```
- `migrate` sets up the SQLite schema.
- `runserver` starts the local web app at `http://127.0.0.1:8000/`.
- `test` runs Django TestCase suites.

## Coding Style & Naming Conventions
- Python follows PEP 8 with 4-space indentation; use `snake_case` for functions and variables.
- Django models use `PascalCase`, and field names stay `snake_case`.
- JavaScript (see `home/static/home/files/dash.js`) uses `camelCase` and small, focused functions.
- No formatter or linter is configured; keep edits consistent with surrounding code.

## Testing Guidelines
Tests are standard Django TestCase modules in `home/tests.py` and `auth/tests.py`. Use `test_*` method names and keep tests close to the feature they cover. Run all tests via `python manage.py test` before major changes.

## Commit & Pull Request Guidelines
Commit history shows short, sentence-style messages in lowercase (e.g., "finished prototype and demo...", "uploading readme file..."). Follow that tone and keep messages descriptive. PRs should include a short summary, testing notes, and screenshots for UI changes. Call out any migrations or API shape changes explicitly.

## Security & Configuration Tips
`DEBUG` is enabled and `SECRET_KEY` is hardcoded in `anbargar/settings.py` for local development. For production, move secrets to environment variables and set `ALLOWED_HOSTS`. Treat `db.sqlite3` and `uploads/` as local-only artifacts unless explicitly needed for a demo.
