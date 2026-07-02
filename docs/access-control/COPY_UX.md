# Access Control Platform — Copy and UX

## Tone

- Clear.
- Operational.
- Non-technical for end users.
- Precise for admins.
- No blame language.

## Login button

```txt
Accedi con Google
```

Optional subtitle:

```txt
Usa il tuo account aziendale UNGUESS.
```

## Access denied

Title:

```txt
Accesso non autorizzato
```

Body:

```txt
Il tuo account Google è valido, ma non hai ancora accesso a questo tool.
Contatta il referente interno del progetto.
```

## Wrong account/domain

Title:

```txt
Account non valido
```

Body:

```txt
Questo tool è riservato agli account Google aziendali UNGUESS.
Accedi con il tuo account aziendale.
```

## Petyr pending grant

Title:

```txt
Accesso in preparazione
```

Body:

```txt
Il tuo account aziendale è valido, ma il grant per Petyr non è ancora attivo.
L’amministratore è stato notificato. Per sapere quando gli accessi saranno disponibili, fai riferimento a Lorenzo Brandi.
Abbiamo pulito la sessione di accesso locale: quando il grant sarà rilasciato, torna alla pagina di login e accedi di nuovo con una sessione pulita.
```

## Auth service unavailable

Title:

```txt
Verifica autorizzazione non disponibile
```

Body:

```txt
Non è stato possibile verificare i tuoi permessi. Riprova tra poco o contatta il referente interno.
```

## Admin panel labels

Recommended labels:

```txt
Utenti
Tool
Ruolo
Permessi
Audit log
Ultimo accesso
Stato
Abilita
Disabilita
Revoca accesso
Assegna ruolo
```

## Terms to avoid

Avoid user-facing terms like:

```txt
forbidden
claim
header
middleware
OAuth callback
```

Use those only in technical docs or diagnostics.
