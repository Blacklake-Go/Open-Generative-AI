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
- Main wallet is canonical for newly admitted paid work after linking. New ONE
  quotes/tasks/checkouts fail with MAIN_WALLET_REQUIRED. Already accepted work,
  reservations and payment callbacks retain their original settlement authority.
  Suspended mappings also block legacy fallback. Legacy bucket balances/expiry
  remain separate; no historical credit is converted or reissued.
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
  settlement and its admin UI are not implemented; no real award is paid by this
  release.** Closing is refused until all approved awards are settled.

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
