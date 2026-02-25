# Funzies API

All endpoints require authentication via either a browser session or an API token.

## Authentication

### Generate a Token

Log into the web app, then create a token:

```bash
# From your browser's dev console or an authenticated session
curl -X POST http://localhost:3000/api/auth/tokens \
  -H "Content-Type: application/json" \
  -b "your-session-cookie" \
  -d '{"name": "my-script"}'
```

Response:

```json
{
  "id": "uuid",
  "name": "my-script",
  "token": "fz_a1b2c3d4e5f6...",
  "prefix": "fz_a1b2c3d",
  "created_at": "2026-02-25T..."
}
```

Save the `token` value — it is shown only once.

### Use the Token

Pass it as a Bearer token in every request:

```bash
export FZ_TOKEN="fz_a1b2c3d4e5f6..."

curl -H "Authorization: Bearer $FZ_TOKEN" \
  http://localhost:3000/api/assemblies
```

---

## Endpoints

### Assemblies

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assemblies` | List all your assemblies |
| `POST` | `/api/assemblies` | Create a new assembly |
| `GET` | `/api/assemblies/{id}` | Get assembly details |
| `GET` | `/api/assemblies/by-slug/{slug}` | Get assembly by slug |
| `DELETE` | `/api/assemblies/{id}` | Delete an assembly |

#### Create an Assembly

```bash
curl -X POST http://localhost:3000/api/assemblies \
  -H "Authorization: Bearer $FZ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"topicInput": "Impact of AI on healthcare"}'
```

#### Get Assembly by ID

```bash
curl -H "Authorization: Bearer $FZ_TOKEN" \
  http://localhost:3000/api/assemblies/{id}
```

### Follow-ups

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assemblies/{id}/follow-ups` | List follow-ups for an assembly |
| `POST` | `/api/assemblies/{id}/follow-ups` | Ask a follow-up question |

#### Ask a Follow-up

```bash
curl -X POST http://localhost:3000/api/assemblies/{id}/follow-ups \
  -H "Authorization: Bearer $FZ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the regulatory risks?", "mode": "ask-assembly"}'
```

### Shares

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assemblies/{id}/shares` | List shares |
| `POST` | `/api/assemblies/{id}/shares` | Create a share link |
| `DELETE` | `/api/assemblies/{id}/shares/{shareId}` | Remove a share |

### Export & Deliverables

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/assemblies/{id}/export` | Export assembly data |
| `GET` | `/api/assemblies/{id}/deliverables` | Get deliverables |

### Token Management (Session Auth Only)

These endpoints require a browser session — Bearer tokens cannot be used here.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/tokens` | Create a new API token |
| `GET` | `/api/auth/tokens` | List your tokens |
| `DELETE` | `/api/auth/tokens/{id}` | Revoke a token |

---

## Errors

All errors return JSON with an `error` field:

```json
{ "error": "Unauthorized" }
```

| Status | Meaning |
|--------|---------|
| `401` | Missing or invalid token |
| `400` | Bad request (missing required fields) |
| `404` | Resource not found |
