# Anbargar - Inventory and Warehouse Management

Anbargar is a full-stack inventory and warehouse management system built with Django. It is designed for small to mid-sized businesses that need a fast, RTL-friendly workflow to track stock, customers, and sales events without the pain of spreadsheets.

## Highlights of this project
- Designed a relational inventory schema with event-based stock movements (BUY/SELL/MOVE) and inventory rollups.
- Built a token-secured REST API used by a rich dashboard UI with CRUD flows and live stats.
- Implemented low-stock monitoring and a simple stockout prediction model based on recent sales.
- Shipped receipt generation with HTML export/print plus local history storage for quick reuse.

## Why This Project
Manual inventory tracking breaks down as soon as you have multiple storage locations, frequent sales, and real customer history. This project unifies those workflows into one dashboard: items, units, folders (warehouses), customers, and events, all tied to a single business context.

## Features
- RTL dashboard with live KPIs (items, folders, total value, low stock count)
- Inventory events that automatically adjust stock levels
- Item catalog with SKU, barcode, and optional QR flag
- Customers and event history for BUY/SELL flows
- Units catalog with per-event unit input
- Stockout prediction using recent SELL event burn rate
- File uploads for item images and assets
- Receipt generator with HTML export/print and local save
- Token-based API for dashboard and external integrations
- OTP and password-based authentication flows

## Tech Stack
- Backend: Django 5.2
- Database: SQLite (local dev)
- Frontend: Django templates + vanilla JS
- Auth: Django sessions + signed access tokens

## Architecture Notes
- Domain models live in `home` (businesses, items, folders, customers, events, inventory).
- Web auth lives in `auth` with phone normalization and signup/login flows.
- The dashboard uses `home/static/home/files/dash.js` to call REST endpoints and render sections.
- Inventory is derived from `FolderItem` and adjusted through `Event` and `EventItem` logic.

## Local Setup
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open:
- `http://127.0.0.1:8000/` (landing)
- `http://127.0.0.1:8000/auth/` (login)
- `http://127.0.0.1:8000/dashboard/` (dashboard)

Optional:
```bash
python manage.py createsuperuser
```

## API Quickstart
Register:
```bash
curl -X POST http://127.0.0.1:8000/api/auth/register/ \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"09123456789\",\"name\":\"Arman\",\"password\":\"secret\",\"business_name\":\"My Business\"}"
```

Login:
```bash
curl -X POST http://127.0.0.1:8000/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"09123456789\",\"password\":\"secret\"}"
```

Use the returned token:
```bash
curl http://127.0.0.1:8000/api/dashboard/stats/ \
  -H "Authorization: Bearer <token>"
```

Key endpoints:
- `POST /api/auth/register/`
- `POST /api/auth/login/`
- `GET /api/auth/session-token/`
- `GET /api/dashboard/stats/`
- `GET|POST /api/folders/`
- `GET|POST /api/items/`
- `GET|POST /api/units/`
- `GET|POST /api/customers/`
- `GET|POST /api/events/`
- `GET /api/inventory/`
- `POST /api/upload/`
- `GET /api/ai/predict-stockout/?days_history=30`

## Data Model (High Level)
- Business, User (many-to-many)
- Folder (supports hierarchy)
- Item, ItemImage
- FolderItem (inventory by folder)
- Unit, ItemUnit
- Customer
- Event, EventItem (BUY/SELL/MOVE)
- Otp (phone verification)

## Project Structure
```
/anbargar           Django project settings
/home               Core app: models, API, dashboard
/auth               Web auth app
/uploads            Uploaded media
/manage.py
/requirements.txt
```

## Security and Ops Notes
- `DEBUG` is enabled in `anbargar/settings.py` for local development.
- Tokens are signed and expire after 30 minutes.
- OTP is logged to the console for dev; replace with an SMS provider for production.
- Uploaded files are stored under `uploads/` and served via `MEDIA_URL` in debug.

## Roadmap Ideas
- Role-based access (manager, clerk)
- Item unit conversions and pricing rules
- CSV import/export and reporting
- Test suite for API and inventory logic

## License
No license specified yet.
