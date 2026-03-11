# DockGuard — Fiche MVP (5 jours)

[![CI/CD](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml)

> Dashboard de scan de sécurité pour images Docker + pipeline DevSecOps complet.
> L'infrastructure **est** le produit — chaque couche démontre une compétence DevOps/DevSecOps.
> Principe : **chaque jour se termine avec un système fonctionnel end-to-end.**

---

## Stack technique

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Backend | FastAPI (Python 3.12) | Déjà maîtrisé (MyStagram), async natif |
| Frontend | Next.js 14 + Tailwind + Recharts | Déjà maîtrisé, graphes de vulnérabilités |
| Scanner | Trivy (CLI) | Standard industrie, gratuit, bien documenté |
| Base de données | PostgreSQL 16 | Stockage historique des scans |
| Cache | Redis | Cache résultats récents (ajouté Jour 5 quand justifié) |
| Monitoring | Prometheus + Grafana | Observabilité (métrique clé pour recruteurs) |
| IaC | Terraform (config AWS EC2) | Infrastructure as Code — même non déployé |
| CI/CD | GitHub Actions | Pipeline DevSecOps avec security gates |
| Container | Docker + Docker Compose | Orchestration locale complète |

---

## Architecture cible

```
┌─────────────────────────────────────────────────────────────┐
│                      GitHub Actions                         │
│  lint → test → build → trivy scan → push GHCR → deploy     │
└─────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Next.js  │────▶│   FastAPI    │────▶│ PostgreSQL│
│ Frontend │     │   Backend    │     └───────────┘
└──────────┘     │              │
                 │  ┌────────┐  │     ┌───────────┐
                 │  │ Trivy  │  │────▶│   Redis   │
                 │  │  CLI   │  │     └───────────┘
                 │  └────────┘  │
                 └──────┬───────┘
                        │ /metrics
                 ┌──────▼───────┐
                 │  Prometheus  │────▶ Grafana (:3001)
                 └──────────────┘
```

---

## JOUR 1 — Backend API + Intégration Trivy (le noyau)

### Objectifs
- Backend FastAPI fonctionnel en local (pas de Docker encore)
- Trivy intégré avec scan asynchrone end-to-end
- Tests écrits en même temps que le code
- Sanitization des inputs dès le premier jour

### Tâches

**1.1 — Initialisation repo + structure**
- [ ] Créer le repo `DockGuard` sur GitHub
- [ ] Structure de dossiers :
```
DockGuard/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── scan.py
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   └── scan.py
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes/
│   │   │       ├── __init__.py
│   │   │       ├── scans.py
│   │   │       └── health.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   └── scanner.py
│   │   └── db/
│   │       ├── __init__.py
│   │       └── session.py
│   ├── tests/
│   │   └── fixtures/
│   │       └── trivy_nginx.json   # Vrai output Trivy sauvegardé
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── alembic/
├── .gitignore
├── .env.example
└── LICENSE (MIT)
```
- [ ] `.gitignore`, `.env.example`, `LICENSE` (MIT)

**1.2 — Modèle de données (SQLAlchemy + Alembic)**
```python
# Un seul modèle. Pas de table Vulnerability — le JSON Trivy dans raw_report
# contient déjà tout. Utiliser les opérateurs JSON de PostgreSQL pour requêter.
# Dénormaliser seulement si on prouve que c'est lent.
class ScanResult(Base):
    __tablename__ = "scan_results"

    id: int (PK)
    image_name: str          # ex: "nginx:latest"
    image_digest: str | None # sha256 si disponible
    scan_status: str         # "pending", "running", "completed", "failed"
    started_at: datetime
    completed_at: datetime | None
    summary: JSON            # {"critical": 2, "high": 5, "medium": 12, "low": 8}
    raw_report: JSON         # rapport Trivy complet (vulnérabilités requêtées via JSON)
    created_at: datetime
```
- [ ] Alembic init + première migration
- [ ] Index GIN sur `raw_report` : `CREATE INDEX idx_raw_report ON scan_results USING GIN (raw_report)` — coût du choix JSON, à faire maintenant pas quand c'est lent

**1.3 — Endpoints API v1**
- [ ] `POST /api/v1/scans` — Lancer un scan (accepte `{"image": "nginx:latest"}`, retourne 202)
- [ ] `GET /api/v1/scans` — Liste paginée des scans (filtres: status, date)
- [ ] `GET /api/v1/scans/{id}` — Détail d'un scan + vulnérabilités extraites du `raw_report`
- [ ] `GET /api/v1/health` — Health check (DB ping)
- [ ] Input sanitization sur le nom d'image (regex whitelist — risque réel d'injection de commandes)
- [ ] CORS configuré

**1.4 — Service scanner + exécution asynchrone**
- [ ] Installer Trivy localement
- [ ] `ScannerService` : wrapper Python autour de `trivy image --format json` via `asyncio.create_subprocess_exec` (jamais `shell=True`)
- [ ] `parse_vulnerabilities(raw_report) -> list[dict]` : une seule fonction qui extrait les vulnérabilités du JSON Trivy — réutilisée par GET `/scans/{id}`, stats, et le frontend
- [ ] Parsing du JSON Trivy → remplir `summary` + stocker `raw_report`
- [ ] Background task : `pending` → `running` → `completed`/`failed`
- [ ] Concurrence limitée : `asyncio.Semaphore(3)` — une ligne, zéro infra
- [ ] Timeout : 5 minutes max par scan
- [ ] Gestion des erreurs (image inexistante, timeout, crash Trivy)

**1.5 — Tests (écrits en même temps, pas après)**
- [ ] Test POST retourne 202 avec image valide
- [ ] Test POST rejette les noms d'images malveillants (`;rm -rf /`, `$(whoami)`, etc.)
- [ ] Test GET retourne le détail du scan avec la bonne structure
- [ ] Test parsing JSON Trivy avec fixture (`tests/fixtures/trivy_nginx.json`)
- [ ] Test des transitions de status

### Critère de validation Jour 1
> `uvicorn` tourne en local, `POST /api/v1/scans {"image": "nginx:latest"}` déclenche un vrai scan Trivy, `GET /api/v1/scans/{id}` retourne les vulnérabilités parsées. Tests passent.

---

## JOUR 2 — Frontend + Docker Compose (rendre visible)

### Objectifs
- Dashboard Next.js fonctionnel
- Stack complète containerisée
- On peut scanner une image depuis le navigateur

### Tâches

**2.1 — Dashboard Next.js — une page qui marche**
- [ ] Next.js 14 App Router + TypeScript + Tailwind
- [ ] **Une page** (`app/page.tsx`) avec trois éléments :
  1. Barre de recherche + bouton scan (POST vers le backend)
  2. Tableau de résultats : sévérité, CVE ID, package, version installée, version fix
  3. Donut chart (Recharts) : répartition par sévérité
- [ ] Polling : tant que le scan est `pending`/`running`, interroger l'API toutes les 2s
- [ ] Extraire des composants uniquement quand la duplication apparaît, pas avant

**2.2 — Docker Compose — stack complète**
- [ ] `docker-compose.yml` : backend + postgres + frontend
- [ ] `docker-compose.dev.yml` : hot reload backend + frontend, ports exposés
- [ ] Backend Dockerfile multi-stage (builder + runtime), Trivy installé dans le stage runtime
- [ ] Frontend Dockerfile multi-stage (build + standalone Next.js)
- [ ] Volume pour persistence PostgreSQL
- [ ] `.env.example` avec toutes les variables documentées

**2.3 — Tests**
- [ ] Frontend : ScanForm soumet correctement, le tableau rend les données de vulnérabilité
- [ ] Docker : `docker compose up --build` fonctionne from scratch (test d'intégration en soi)

### Critère de validation Jour 2
> `docker compose up --build` démarre tout. Ouvrir le navigateur, taper `nginx:latest`, cliquer scan, voir les vulnérabilités apparaître dans le tableau et le graphe.

---

## JOUR 3 — Pipeline CI/CD + Stats (prouver que ça ship)

### Objectifs
- Pipeline GitHub Actions complet en un seul workflow
- Endpoint stats enrichi
- Pages d'historique et de détail

### Tâches

**3.1 — GitHub Actions — un workflow, bien fait**
- [ ] **Un seul fichier** : `.github/workflows/ci.yml`
```yaml
name: DockGuard CI/CD

on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main]

jobs:
  lint:
    # Ruff (Python) + ESLint (TS) — en parallèle

  test:
    # pytest --cov + npm test — en parallèle

  build:
    needs: [lint, test]
    # Build images Docker backend + frontend
    # Tag avec SHA du commit

  security-scan:
    needs: [build]
    # Trivy scan des images buildées
    # Upload SARIF → GitHub Security tab
    # FAIL si vulnérabilité CRITICAL

  push-registry:
    needs: [security-scan]
    # Push sur GHCR (GitHub Container Registry)
    # Tag: latest + SHA
    # Seulement sur main
```
- [ ] Badge CI status dans le README

**3.2 — Endpoint stats + pages frontend**
- [ ] `GET /api/v1/stats` : total scans, répartition sévérité, top 10 CVEs, top 5 images (requêtes SQL sur `raw_report` JSON)
- [ ] Page historique des scans (`app/scans/page.tsx`) : tableau des scans passés avec badges de status, clic vers le détail
- [ ] Page détail d'un scan (`app/scans/[id]/page.tsx`) : tableau complet des vulnérabilités avec filtre par sévérité + tri
- [ ] Cards de stats sur la page d'accueil du dashboard

**3.3 — Tests**
- [ ] Test endpoint stats retourne les bonnes agrégations
- [ ] Vérifier que le pipeline CI tourne au vert sur un push vers `dev`

### Critère de validation Jour 3
> Push sur GitHub → pipeline complet se lance → tout vert → badge dans le README. La page stats affiche les données agrégées sur plusieurs scans.

---

## JOUR 4 — Monitoring + Terraform (les preuves DevOps)

### Objectifs
- Prometheus + Grafana fonctionnels avec métriques custom
- Configuration Terraform propre et validée
- Prouver les compétences monitoring et IaC

### Tâches

**4.1 — Métriques Prometheus côté backend**
- [ ] Intégrer `prometheus_client`
- [ ] 4 métriques custom :
  - `dockguard_scans_total` (counter, labels: status)
  - `dockguard_scan_duration_seconds` (histogram)
  - `dockguard_vulnerabilities_found` (counter, labels: severity)
  - `dockguard_active_scans` (gauge)
- [ ] Endpoint `GET /metrics` au format Prometheus

**4.2 — Config Prometheus + Grafana**
```
monitoring/
├── prometheus/
│   └── prometheus.yml          # scrape backend /metrics toutes les 15s
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   └── prometheus.yml
    │   └── dashboards/
    │       ├── dashboard.yml
    │       └── dockguard.json  # Dashboard pré-configuré
    └── grafana.ini
```
- [ ] Ajouter Prometheus + Grafana au Docker Compose (Grafana sur :3001)
- [ ] Dashboard Grafana provisionné : 4 panels correspondant aux 4 métriques

**4.3 — Terraform — plat, honnête, simple**
```
terraform/
├── main.tf              # VPC + subnet + security group + EC2 + RDS — tout ici
├── variables.tf         # Toutes les variables avec descriptions
├── outputs.tf           # IP publique, endpoint DB
├── provider.tf          # Provider AWS
└── terraform.tfvars.example
```
- [ ] Pas de modules — un seul `main.tf` avec des commentaires clairs (les modules servent à gérer la complexité à l'échelle, pas pour un VPC + un EC2 + un RDS)
- [ ] EC2 avec `user_data` qui lance `docker compose up` depuis les images GHCR
- [ ] RDS PostgreSQL
- [ ] Security group : ports 80, 443, 22 uniquement
- [ ] `terraform validate` passe

### Critère de validation Jour 4
> `docker compose up` → Grafana sur :3001 affiche des données réelles après quelques scans. `terraform validate` passe.

---

## JOUR 5 — Polish + README + Démo (shipper)

### Objectifs
- App prête pour le portfolio
- README professionnel avec screenshots
- Données de démo convaincantes

### Tâches

**5.1 — UX polish**
- [ ] Dark mode toggle (classes Tailwind `dark:` — 30 minutes max)
- [ ] Skeleton loaders pendant les scans
- [ ] Responsive check
- [ ] États d'erreur : image introuvable, timeout, backend inaccessible

**5.2 — Redis — il gagne sa place maintenant**
- [ ] Ajouter Redis au Docker Compose
- [ ] Cache : ne pas re-scanner la même image:tag pendant 10 minutes (cas d'usage réel)
- [ ] Test du comportement de cache

**5.3 — Script de seed / démo**
- [ ] Script qui lance 5-6 scans sur des images variées :
  - `nginx:latest`, `node:18`, `python:3.12-slim`, `postgres:16`, une vieille image vulnérable (ex: `node:10`)
- [ ] Les dashboards Grafana et frontend sont peuplés avec des données réalistes

**5.4 — README professionnel**
- [ ] Badges : CI status, license
- [ ] Description en un paragraphe
- [ ] Diagramme d'architecture (Mermaid)
- [ ] Quick Start : `git clone && docker compose up --build`
- [ ] Screenshots : dashboard, détail scan, Grafana (après exécution du seed script)
- [ ] Section "DevSecOps Pipeline" : explication du flow CI/CD

**5.5 — Checklist finale**
- [ ] `docker compose up --build` fonctionne from scratch
- [ ] Tous les tests passent
- [ ] Pipeline CI/CD complet et vert
- [ ] `terraform validate` passe
- [ ] Aucun secret dans le repo
- [ ] `.env.example` complet et documenté
- [ ] License MIT
- [ ] README impeccable

### Critère de validation Jour 5
> Un inconnu clone le repo, lance `docker compose up --build`, ouvre le navigateur, et voit un dashboard de scan de sécurité fonctionnel avec des données pré-remplies. Le README explique tout.

---

## Résumé : ce que le recruteur voit

| Compétence | Preuve dans le projet |
|------------|----------------------|
| Backend / API | FastAPI, endpoints REST, async, PostgreSQL, JSON queries |
| Frontend | Next.js, Recharts, responsive, dark mode |
| Docker | Multi-stage builds, Compose, orchestration |
| CI/CD | GitHub Actions pipeline complet avec security gates |
| DevSecOps | Trivy, SARIF, security gates, input sanitization |
| Monitoring | Prometheus métriques custom, Grafana dashboard provisionné |
| IaC | Terraform validé, commenté, prêt à déployer |
| Tests | pytest + Jest, écrits avec le code, coverage > 70% |
| Documentation | README pro, architecture Mermaid, Swagger |

---

## Décisions architecturales clés

| Décision | Choix | Justification |
|----------|-------|---------------|
| Pas de table `Vulnerability` | Stocker dans `raw_report` JSON, requêter via PostgreSQL JSON | Pas de preuve que c'est lent, dénormaliser si besoin prouvé |
| Pas de Redis pour rate limiting | `asyncio.Semaphore(3)` | Une ligne vs un service entier, un seul backend |
| Redis ajouté Jour 5 | Cache résultats récents (10 min) | Cas d'usage réel justifié |
| Un seul workflow CI | Tout dans `ci.yml` | Un pipeline vert > trois workflows à moitié configurés |
| Terraform sans modules | Un `main.tf` plat avec commentaires | Les modules servent à l'échelle, pas pour 3 ressources |
| Tests écrits chaque jour | Pas de "jour tests" séparé | Code non testé de 4 jours = code oublié |
| Docker Compose au Jour 2 | D'abord coder en local | Debug via `uvicorn --reload` est 10x plus rapide |

---

## Notes pour travailler avec Claude

À chaque début de session de dev, donne-moi :
1. Le jour en cours (ex: "Jour 3")
2. Ce que tu as déjà terminé
3. Les blocages éventuels

On avancera tâche par tâche.
