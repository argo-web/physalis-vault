# Physalis — Scripts de backup/failover

Scripts shell pour la stratégie décrite dans [docs/todo-backup-failover.md](../../docs/todo-backup-failover.md).

## Architecture rapide

```
PRIMARY (vault.argoweb.fr)              SECONDARY (vault-backup.argoweb.fr)
─────────────────────────────           ──────────────────────────────────
physalis-dump.sh                     physalis-pull-backup.sh   (cron 3h00)
  (forced-command, declenche  ◄── ssh ── physalis-rotate.sh        (cron 3h30)
   par le secondaire)                    physalis-restore.sh       (manuel)
                                         physalis-test-restore.sh  (cron mensuel)
```

Le **secondaire pull**, le primaire est passif. Une compromission du primaire ne donne aucun accès au stockage des backups.

---

## Installation

### Sur le PRIMARY

```bash
# 1. Copier le script
sudo install -o root -g root -m 700 \
  primary/physalis-dump.sh /usr/local/bin/

# 2. Importer la cle publique GPG (generee sur le secondaire) dans le keyring root
sudo gpg --import < /tmp/backup-public.gpg
sudo gpg --edit-key backup@argoweb.fr trust
# → choisir 5 (ultimate) ; le script utilise --trust-model always en fallback

# 3. Creer le user backup-pull (nologin shell, accès Docker)
sudo useradd -m -s /usr/sbin/nologin -d /home/backup-pull backup-pull
sudo usermod -aG docker backup-pull
sudo mkdir -p /home/backup-pull/.ssh
sudo chmod 700 /home/backup-pull/.ssh
sudo chown -R backup-pull:backup-pull /home/backup-pull/.ssh

# 4. Importer la cle GPG publique pour le user backup-pull aussi
sudo -u backup-pull gpg --import < /tmp/backup-public.gpg
sudo -u backup-pull gpg --edit-key backup@argoweb.fr trust  # 5 = ultimate

# 5. Installer la cle publique SSH du secondaire dans authorized_keys avec forced-command
sudo tee /home/backup-pull/.ssh/authorized_keys >/dev/null <<'EOF'
command="/usr/local/bin/physalis-dump.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty,restrict ssh-ed25519 AAAA...PUBKEY_DU_SECONDAIRE... backup@vault-backup
EOF
sudo chmod 600 /home/backup-pull/.ssh/authorized_keys
sudo chown backup-pull:backup-pull /home/backup-pull/.ssh/authorized_keys

# 6. Test depuis le secondaire (cf. plus bas)
```

### Sur le SECONDARY

```bash
# 1. Generer la paire de cles GPG (si pas encore fait)
sudo gpg --full-generate-key
# RSA 4096, nom "Physalis Backup", email backup@argoweb.fr, PASSPHRASE VIDE

# 2. Exporter la cle publique pour le primaire
sudo gpg --export --armor backup@argoweb.fr > /tmp/backup-public.gpg
scp /tmp/backup-public.gpg gael@PRIMARY:/tmp/

# 3. ESCROW : exporter la cle privee dans un password manager (Bitwarden/1Password)
sudo gpg --export-secret-keys --armor backup@argoweb.fr > /tmp/backup-private.gpg
# → copier le contenu dans le password manager partage de l'agence
# → SUPPRIMER le fichier local
shred -u /tmp/backup-private.gpg

# 4. Durcir le keyring root
sudo chown -R root:root /root/.gnupg
sudo chmod 700 /root/.gnupg
sudo find /root/.gnupg -type f -exec chmod 600 {} \;

# 5. Generer une paire SSH dediee au pull (sans passphrase, le job tourne en cron)
sudo ssh-keygen -t ed25519 -f /root/.ssh/id_backup_pull -N "" -C "backup@vault-backup"
sudo cat /root/.ssh/id_backup_pull.pub
# → copier dans authorized_keys du primaire (etape 5 plus haut)

# 6. Copier les scripts
sudo install -o root -g root -m 700 \
  secondary/physalis-pull-backup.sh \
  secondary/physalis-rotate.sh \
  secondary/physalis-restore.sh \
  secondary/physalis-test-restore.sh \
  /usr/local/bin/

# 7. Creer les dossiers
sudo install -d -o root -g root -m 700 /srv/backups/physalis
sudo touch /var/log/physalis-backup.log
sudo chmod 640 /var/log/physalis-backup.log

# 8. Installer le cron (cf. exemple plus bas)
```

### Test manuel (depuis le secondaire)

```bash
# Premier pull manuel — verifie tout le chain (SSH, GPG, integrity)
sudo /usr/local/bin/physalis-pull-backup.sh

# Confirmer la creation du fichier
sudo ls -lh /srv/backups/physalis/

# Tester la restauration dans une DB scratch
sudo /usr/local/bin/physalis-test-restore.sh
```

---

## Cron (sur le SECONDARY)

`/etc/cron.d/physalis-backup` :

```cron
# /etc/cron.d/physalis-backup
# m h dom mon dow user command
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# UUIDs healthchecks.io (cf. https://healthchecks.io)
HEALTHCHECK_UUID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
RESTORETEST_UUID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy

# Pull quotidien a 3h00
0  3 * * * root /usr/local/bin/physalis-pull-backup.sh
# Rotation a 3h30 (apres le pull)
30 3 * * * root /usr/local/bin/physalis-rotate.sh
# Test de restauration le 1er du mois a 4h00
0  4 1 * * root /usr/local/bin/physalis-test-restore.sh
```

Le file doit etre `chmod 644` et appartenir a `root:root`. Verifier que `cron` le pickup avec `sudo systemctl status cron`.

---

## Scripts — résumé

| Script | Hôte | Déclencheur | Rôle |
|---|---|---|---|
| `primary/physalis-dump.sh` | PRIMARY | SSH forced-command (par secondaire) | `pg_dump | gzip | gpg --encrypt`, stdout = stream |
| `secondary/physalis-pull-backup.sh` | SECONDARY | cron 3h00 | Pull du dump, vérif intégrité, rename atomique, heartbeat |
| `secondary/physalis-rotate.sh` | SECONDARY | cron 3h30 | Rotation 7 daily + 12 monthly |
| `secondary/physalis-restore.sh` | SECONDARY | manuel (failover) | Restore destructif + restart app, confirmation requise |
| `secondary/physalis-test-restore.sh` | SECONDARY | cron mensuel | Restore dans DB Postgres scratch, count rows + tables sentinelles |

---

## Variables d'environnement

Toutes ont des valeurs par défaut sensées, mais override possible via le cron file ou en `KEY=val script.sh` :

| Var | Défaut | Utilisé par |
|---|---|---|
| `PHYSALIS_DB_CONTAINER` | `physalis-db` | `dump.sh`, `restore.sh`, `test-restore.sh` |
| `PHYSALIS_DB_USER` | `physalis` | idem |
| `PHYSALIS_DB_NAME` | `physalis` | idem |
| `PHYSALIS_GPG_RECIPIENT` | `backup@argoweb.fr` | `dump.sh` |
| `PRIMARY_HOST` | `vault.argoweb.fr` | `pull-backup.sh` |
| `PRIMARY_USER` | `backup-pull` | `pull-backup.sh` |
| `SSH_KEY` | `/root/.ssh/id_backup_pull` | `pull-backup.sh` |
| `BACKUP_DIR` | `/srv/backups/physalis` | `pull-backup.sh`, `rotate.sh`, `restore.sh`, `test-restore.sh` |
| `BACKUP_LOG` | `/var/log/physalis-backup.log` | tous (sauf dump) |
| `COMPOSE_DIR` | `/srv/projets/secretvault` | `restore.sh` |
| `DAILY_KEEP` | `7` | `rotate.sh` |
| `MONTHLY_KEEP` | `12` | `rotate.sh` |
| `PG_TEST_IMAGE` | `postgres:16-alpine` | `test-restore.sh` |
| `HEALTHCHECK_UUID` | (non défini) | `pull-backup.sh` (skip si vide) |
| `RESTORETEST_UUID` | (non défini) | `test-restore.sh` (skip si vide) |

---

## Failover en cas de panne du primaire

Voir le runbook complet dans [docs/todo-backup-failover.md § Procédure de basculement](../../docs/todo-backup-failover.md). En résumé :

```bash
# Sur le secondaire
sudo /usr/local/bin/physalis-restore.sh --yes
# Puis basculer le DNS vault.argoweb.fr → IP secondaire chez le registrar
```
