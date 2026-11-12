# SupDance ONE staged unification

Production source authority was freshly audited. The live Next.js root is
`/home/wwwroot/AI/domain/supdance.com/web`, original HEAD da2a3ac with693 dirty paths.
The separate source-snapshot commit2017cc3 preserves that drift; it is not the
feature diff. External public assets omitted from Git remain in the full server
runtime-source archive and must be preserved when constructing a release.
Never deploy by overwriting that dirty root or copying a local historical main.

## Stage2 implementation

- Separate Ed25519 signing keys, one-time browser/session-bound challenges,
  explicit one-to-one mappings and allowlists. Existing accounts prove ownership
  on both sites; SSO shadow users receive no credits, email merge or role promotion.
- New checkout for linked users moves to the main wallet. Identity rollout is
  separate from financial cutover: SUPDANCE_FEDERATION_TRANSACTIONS_ON_MAIN=false
  by default preserves ONE generation under existing authorization, reservation
  and expiry rules. Even when explicitly enabled, positive historical buckets,
  frozen reservations or unexpired returned lots retain their old spending path.
  Main SSO shadow accounts with no historical value always create on main; they
  cannot open a second ONE spending wallet through identity rollout. At financial
  cutover, all linked users with no remaining legacy value create on main.
  Already accepted jobs and callbacks retain original settlement authority.
  Suspended mappings block fallback. No balance is converted or reissued.
- Additive088 provides mapping/audit and append-only provenance snapshots. The
  importer rejects changes to previously observed immutable financial entries.
- Integer pricing uses exact upward rounding, worst net package revenue after
  bonuses and verified fees. Current audit covers133 enabled tiers ×4 groups.
  Eight enabled USD packages have integer credits and minimum$10. Actual payment
  fee evidence is absent; proposals are not applied or labeled loss-proof.
- Community mode is disabled by default. Candidate flags:
  SUPDANCE_COMMUNITY_ENABLED=true and NEXT_PUBLIC_SUPDANCE_COMMUNITY_MODE=true.
  Community navigation, owned ONE/main asset submission, pending moderation,
  version guards, actor revalidation, controlled public media and soft withdrawal
  preserve old links and source assets. Unpublished DB rows cannot fall back to
  public builtin content. Pagination/featured filtering are repaired.
- Open calls use immutable rules, server-controlled integer prizes, owned published
  entries, frozen post/rules snapshots, deadline and judge ownership guards.
  Award approval is an outbox record, not a wallet credit. **Central prize
  settlement is not implemented; no real award is paid by this
  release.** The permission-controlled admin page supports draft creation,
  publication, deadline-gated judging and award approval with explicit pending
  settlement status. Closing is refused until all approved awards are settled.

## Validation and rollout contract

Run tests only on the named independently restored PostgreSQL databases. Test
fixture images and credits are labeled QA and are not provider acceptance. Main
has no schema migration. ONE088/089 are additive; migrate in a transaction through
the normal migration ledger after a fresh verified dump and isolated restore.
Disable outbound workers on restored clones; do not mount live writable data.

Before production: full application build, same-origin browser acceptance on the
clone canary, old/new route and media regressions, forward/backward route switch,
and current financial fingerprints. Rollback changes routing/build pointers and
feature flags, never replaces a live financial database with an old dump. Keep
mapping/audit data and historical orders. New features should be enabled for QA
allowlisted users first. Record actual commit, BUILD_ID, source hashes, test logs
and final traffic state separately; a build or200 response alone is not acceptance.

Music budget remains cumulative21.3/50 credits; no new paid calls in stage2.

## Reproducible source and CI correction

The first cloud run exposed a pre-existing package.json/lockfile mismatch before
any test ran. The lockfile is regenerated from the declared dependencies without
running package scripts; no live dependencies are changed. CI uses Node24 like the
validated Linux candidate and explicitly includes development dependencies needed
for tests and workspace builds, even under NODE_ENV=production.

The three required library workspaces previously had only upstream gitlinks in
this repository while the running site used physical production workspace source.
Their required package directories are now captured at the existing import paths,
with original licenses or license declarations and a per-file checksum manifest in
`production-workspaces-20261112.json`. Unrelated upstream applications and generated
dist/node_modules remain excluded. Only missing final LF is normalized and recorded.
The original server and developer checkouts remain untouched.

Protected restored-snapshot acceptance tests require SUPDANCE_RESTORED_DRILL=true
and the named one-db host. Standard CI explicitly skips those three private-fixture
files; this is not a passing restoration claim. Their actual restored-data results
are delivered separately. Enabling the marker on another host still fails before
database imports. A clean-lockfile CI build remains required before production
promotion, independently of the earlier candidate built with existing dependencies.

Federation request bodies are bounded on actual streamed bytes, including requests
without Content-Length; credentials and assertions are parsed only after the 16KiB
limit and MIME check. Community/account pages follow the existing six-language
route structure and canonical prefix redirects.

CI fixture repairs retain production safety contracts: valid reserved telephone
examples, current `/api/assets/library` ownership boundaries, identical studio
identity for idempotent retries, complete verified local route specifications,
and ephemeral test-only encryption keys. A persisted Canvas receipt is polled
without resubmission and its credits remain reserved. An unknown stale upstream
outcome also remains reserved with one reconciliation event. Explicit upstream
terminal failures and the existing storage compensation policy still release
credits once. None of these repairs weakens runtime admission or financial guards.

## GitHub regression preservation

The server snapshot had older or absent test/document files relative to GitHub
main. The snapshot commit remains an immutable audit record. The combined feature
tree restores every GitHub main regression test and previously omitted supporting
document, static reference asset and service definition. It does not remove those
checks to make CI pass. Only test-local ephemeral result-encryption setup is added
to the two generation integration fixtures. New restored-snapshot acceptance files
remain separately guarded. Current full-suite totals must be refreshed after this
reconciliation; earlier server-only 22-test results are not the final suite.
