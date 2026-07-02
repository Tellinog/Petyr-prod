# Access Control Platform — Error codes and messages

## Canonical errors

| HTTP | Code | User-facing message | Meaning |
|---:|---|---|---|
| 401 | `missing_authenticated_user` | Sessione non valida o utente non autenticato. Accedi nuovamente con Google. | Tool did not receive trusted user header. |
| 401 | `invalid_session` | Sessione non valida. Accedi nuovamente. | Session/token is invalid. |
| 403 | `forbidden` | Il tuo account Google è valido, ma non sei autorizzato a usare questo tool. | User lacks membership/permission. |
| 403 | `user_disabled` | Il tuo account è stato disabilitato per questo servizio. | User is disabled in Auth API. |
| 403 | `tool_disabled` | Questo tool non è attualmente disponibile. | Tool is disabled. |
| 404 | `tool_not_found` | Tool non configurato. Contatta il referente interno. | Unknown `tool_key`. |
| 422 | `invalid_required_permission` | Permesso richiesto non valido. | Permission does not exist for the tool. |
| 503 | `auth_service_unavailable` | Impossibile verificare l’autorizzazione. Riprova più tardi. | Auth API unavailable. |

## UX rule

User-facing messages should be clear but not expose internal details.

Technical details should be logged server-side and, if needed, returned as a request ID.

## Access denied copy

```txt
Accesso non autorizzato.
Il tuo account Google è valido, ma non sei autorizzato a usare questo tool.
Contatta il referente interno del progetto.
```

## Missing login copy

```txt
Accesso richiesto.
Per continuare devi accedere con il tuo account Google aziendale UNGUESS.
```
