# Recovery breadcrumb — `drizzle.__drizzle_migrations` pre-rebaseline snapshot

Captured **2026-05-06** before the re-baseline truncate. Project: `vbqobyagjzvlfpfozvmx`.

If anything goes wrong after the re-baseline, this file is the source of truth for restoring the original migration-tracking table.

## Schema

```
id           integer  -- autoincrement primary key
hash         text     -- sha256 of migration SQL content (drizzle-orm format)
created_at   bigint   -- epoch milliseconds (drizzle's "folderMillis")
```

Total rows: **112** (`max(id) = 121` — there are gaps at ids 57–58 and 93–99 from prior migration churn).

## Full table contents (ordered by id)

```json
[
  {"id":1,"hash":"e3db31ea07dbbcdb46a128fb101fe00117cc48fdcadba0a6e650417a74f3a040","created_at":1770661017832},
  {"id":2,"hash":"e4e31ca280462f079963dcba6ebd3ed7aa333483af241b8e27fa54fb2feb68fb","created_at":1770847885060},
  {"id":3,"hash":"dadaaa63bb99a75c4d91c975c63db62b9bf250efe560357019bda1443f868e2f","created_at":1770902637217},
  {"id":4,"hash":"e95f2a792a54161cb25284d716d14cc0a5d79579958f0a461518c52c3de4ae08","created_at":1770902660815},
  {"id":5,"hash":"e2d871d380c46762cc7a5b95640d681dfed955040799a1fce92b8534566a391f","created_at":1770924460099},
  {"id":6,"hash":"d17ea08d209d8c62903f235e4d4142a597d72d8948989d1cdf774af69c8a4431","created_at":1771103942260},
  {"id":7,"hash":"a0d4105d5205cec13217718e528bc7c8b687d9272aa0fc987c9f288afc6c83aa","created_at":1771168242695},
  {"id":8,"hash":"f022c7a07f4cfbe15c8ee6268b50b61d195bb8d545885737fda77468233b4e5b","created_at":1771247770680},
  {"id":9,"hash":"e4e79d1b58c5997c421bb49273ed2805ebd32b1c5ef07854614b9edff06814d0","created_at":1771295335886},
  {"id":10,"hash":"c161c400c8873adcaa1bb536a589c1885e1e4649ccaeda5dd3a818b6a71fd41c","created_at":1771374643935},
  {"id":11,"hash":"3724809ecb07b4c9e392196bb109bfc0c9ba74fd9016884dca2c736499703f47","created_at":1771415383058},
  {"id":12,"hash":"e61a9c11e320045ff96dc2907dc454db62b9bcc5b237fa2e906728c077e22dce","created_at":1771520395122},
  {"id":13,"hash":"b10265a160d4d752333505cca1e1e7c4c819df4a222f455a4f58f4afe9c0b187","created_at":1771541317270},
  {"id":14,"hash":"3d6b1de53fe7702d2298d8e76c3f0991a5902b7e8daea8399bfabb1d7bc5cf28","created_at":1771705755540},
  {"id":15,"hash":"e2bfa6167658e15e0fbd0e954d2f5e15788ed6c187ae859d7e4842715002beb1","created_at":1771705759818},
  {"id":16,"hash":"d90d5b802a07583c66c2f4480dd18d408e80ff17c12b22a028abf0c76f59b0bc","created_at":1771733172871},
  {"id":17,"hash":"e07b9c91500403f873d59bc6aa2365485dd395a17bdd392a0d2ebe3b14b49ce0","created_at":1771800000000},
  {"id":18,"hash":"89c95bb64a2458df51f9ea234db7e017ab95b167d30d3d881a3ec7c47eda442a","created_at":1771900000000},
  {"id":19,"hash":"3a893955fd94b09a128bb8465ce08384c0744b39c269d20cff6afdaa1eac2297","created_at":1771990000000},
  {"id":20,"hash":"2cc7dfd37d8619ddfb0567d87b938a89feb66bfae7af9de5375e91249f50d4cc","created_at":1772000000000},
  {"id":21,"hash":"bf8a5ef936ee49370a98a0c7f788f17ac2dcca24ce86179585b941c9eec3b985","created_at":1772100000000},
  {"id":22,"hash":"c43062e394aff8db3bd1c3472818c05408cc6061d5726727a205e92a0a59afd8","created_at":1772200000000},
  {"id":23,"hash":"cc94d81c1b405f3ca8a687bee04ce7a09ed4fb1d1da2b727d10e68d6acf5c6ea","created_at":1772300000000},
  {"id":24,"hash":"c181c9023adbc966781fd1181f51b621b7021581ebc5d3eccb831208ea2534c0","created_at":1772400000000},
  {"id":25,"hash":"c579d6819f2510681e58f6c09b311bc7fb53db38c509ffd298c23791ad7a0ce2","created_at":1772500000000},
  {"id":26,"hash":"608ee81e3254d34d52ae0c68767a9d83d6c61ea03c9b6ccf2baf182a82d1157f","created_at":1772600000000},
  {"id":27,"hash":"91463ab96c6a53ae60766ce2d03ffaf7d1026796136c83820bedb5f829b023ac","created_at":1772700000000},
  {"id":28,"hash":"0e8dbcd88ad7f8a700095509a539d549ef83bfe342178b8677266826ccf01ca6","created_at":1772800000000},
  {"id":29,"hash":"8e424a0bf783c40ea332d6bb1ad60ae9723bafbe5abe0114bc63d15cbcd5a9ff","created_at":1772810000000},
  {"id":30,"hash":"7b83b445e93f61110ed6728500a37283cc46dd6f30a8a418c12f0203ecfcfd2f","created_at":1772820000000},
  {"id":31,"hash":"b5b4fe7250008dcc453898b51b798b5aeea9893a7ff68b72aac8b5b90e16fc15","created_at":1772830000000},
  {"id":32,"hash":"2147492853a1fa22dc37dbad92708f2eab7b0d23ffe3c3e044c9e4716651b8b8","created_at":1772840000000},
  {"id":33,"hash":"b264b9a37b13950fd95da6353be1b9f0111169d91c0560121bc601eb954702ca","created_at":1772850000000},
  {"id":34,"hash":"9d2149217cbc1a9417a4ff60fea95abdba852053bc469eb67be3fbfec0a972be","created_at":1772860000000},
  {"id":35,"hash":"8e9a78ba4b64d4380db7b878cee22ddf52c659f8362d3e62a4d4d3ef87d110c7","created_at":1772870000000},
  {"id":36,"hash":"a96a06232f30a554a3cf8d7dc1d624fdb279fd52460465892e58361ca70cd5e4","created_at":1772880000000},
  {"id":37,"hash":"20134536ece56d935cd6ff5a37515c7268a6a5705fdd06842884387f99e18a33","created_at":1772890000000},
  {"id":38,"hash":"b1bb523e565535a77a935aa1f1db71874d204af6e7b533697a5d2ec3799f316f","created_at":1772900000000},
  {"id":39,"hash":"f5f4259138ec843de9b889f1823ba3739250a4675a41178338b0c6fbfead0792","created_at":1772910000000},
  {"id":40,"hash":"b54282683583e8738e0dc3458a12bfadf9935930f65a7f1a100bd7950ce01d8b","created_at":1772920000000},
  {"id":41,"hash":"f0dc73d3c1a5174f5c5b90ad9d379404be153e51d59f32686e76917b77a26698","created_at":1772930000000},
  {"id":42,"hash":"8a08a54872f894d778d853998fd2155625fefd1f1be1c668e456640a5e977c57","created_at":1772940000000},
  {"id":43,"hash":"ee8ed19f7c9cf12863a810a817b040a09d588b6aa3abffbcf11d41479795fc4b","created_at":1772950000000},
  {"id":44,"hash":"3c6c57c1f926036454657716ca9cf1c18c78df626a5533a76702017cb73405da","created_at":1772960000000},
  {"id":45,"hash":"bf1c4fd7acd2a0537b1012e632154bb115f1ba7d8f610dec38a98a6d70d5e979","created_at":1772970000000},
  {"id":46,"hash":"a5e47d5e47cfb55626ac0424052b39e928fe0bb51bf78248d236de9582a1d93e","created_at":1772980000000},
  {"id":47,"hash":"81d4ae60fa32f5f83ac068bcefcbe7185f59040dcbe30c0fb911d13f1c6cce97","created_at":1772990000000},
  {"id":48,"hash":"004c9e8e6cdf9817dbf14526146184e0117ead5fc7e3736ff6834af6693f3571","created_at":1773000000000},
  {"id":49,"hash":"be23079b3f4dd52949b5a58b45e7a8ee6229211934f10ead1155bb49667ab2dd","created_at":1773010000000},
  {"id":50,"hash":"c3ca9ab55002c90ad629dd279b2bb00425236fc26c6199599fbad7513ed525ef","created_at":1773020000000},
  {"id":51,"hash":"c9b946df141a83dc169ae39759a42a28a2bb5363be51b854837545cadf9360b1","created_at":1773030000000},
  {"id":52,"hash":"8a88be5e624192db1a0fa879911e767e3441ca4bcd465678e533bf114c166b40","created_at":1773040000000},
  {"id":53,"hash":"5e2e9e48175aa81351568b86b8088ff41f1ec5832993dade6a8fb42ce219efc7","created_at":1773050000000},
  {"id":54,"hash":"f3521109ddbcb1ed328dd970897e0abb82c8b030c1c51850eb53a63e6452ce54","created_at":1773060000000},
  {"id":55,"hash":"80f0835da2816377ba61b879f23447cecf437a6320c8b7a8ae7af7e679f774d1","created_at":1773070000000},
  {"id":56,"hash":"064bb79ef017c2986414766dab36775676f42da0943b0f55c0c0f1bd73b0c33f","created_at":1773080000000},
  {"id":59,"hash":"5d123db4ef6c33130c5f4cff6a50f0d954454f37683274e3bce44cc044d23118","created_at":1773090000000},
  {"id":60,"hash":"1807b20a226f03e8071574de9dbef2031a42d5c74c5ddf66c42bdb32611c21d4","created_at":1773100000000},
  {"id":61,"hash":"63f083745704b44adbf3b84cfebdfbdbf3f1cdee2b217561e1e80c29fd97f589","created_at":1773110000000},
  {"id":62,"hash":"25140ab573aa93d68115cde6050c9e7bb96f9346c631ae74410495d6aae21b0b","created_at":1773120000000},
  {"id":63,"hash":"5a3445c7bb02d11c65559374e03a84b622e2ae973f42933ec08e7a0bdac9e13e","created_at":1773130000000},
  {"id":64,"hash":"53bd422637b0aa4e54b56bc684104df42cbad97858fd00466391b1e58ae68e7d","created_at":1773140000000},
  {"id":65,"hash":"88e6f53fa9f730969ddf07b436a875913f10d980d0f968992516a74fa19e01e0","created_at":1773150000000},
  {"id":66,"hash":"e9f33655085590879dfe3c47b408d0824b95cf2d24a7a2ae16585e857259662a","created_at":1773160000000},
  {"id":67,"hash":"f6e899cc4f3698f56c3579aaa8ec19242e8c528cae08edb7baa8435c7155c8cf","created_at":1773170000000},
  {"id":68,"hash":"8a96aebd3dca141a00f65ba39b425a72c0c6062ad5cbd96eb5b570a2995a477c","created_at":1773180000000},
  {"id":69,"hash":"d21f320f15595dbdfefff5bae6efdf92ce066f4e0785634298640cda5ce04aef","created_at":1773190000000},
  {"id":70,"hash":"4e6e2e136546b3c146f7e598e42a6918459056836e94dcb23baa7cbfa30ea386","created_at":1773200000000},
  {"id":71,"hash":"ca0a5172407715884f9ef10d0264d97e6d19051a9351f92907374757213a2bcd","created_at":1773210000000},
  {"id":72,"hash":"a7b1efdc38f55307037344a54fba8da84118d8cb1a96f6ca033e2813a98d3ce7","created_at":1773220000000},
  {"id":73,"hash":"f8a7786d48cfb0c06393de8836b4df35b1b3d7775e01896b12b6e93a6b0a8db0","created_at":1773230000000},
  {"id":74,"hash":"baa9c17f1d4569271c7526894785f0542542b3752f392d9a81e6984f3761ff69","created_at":1773240000000},
  {"id":75,"hash":"2b8c8fe893386146b1e5b9cba697f046f92633ca3216afa2b368d31902ce1c3a","created_at":1773250000000},
  {"id":76,"hash":"85d144f44497a7be8849cbff8e8e0c79e30f6caac79359c8cc2a76d8e185ed83","created_at":1774260000000},
  {"id":77,"hash":"02fec0cd1490f6b6ddbcfa49e638630cac979fc3c186c2fd5892eb8e1d140025","created_at":1774360000000},
  {"id":78,"hash":"ef3bff838f947303ffa71c84f3a4e3bf12daa0a0f37798f99a57e040cdabb955","created_at":1774460000000},
  {"id":79,"hash":"60e0a0829ec704efb862233aa1ebd1abed961bc66bbb4eed2c8bec43bfd1db21","created_at":1774470000000},
  {"id":80,"hash":"c64a27f7b5451cbf67c09f10ae3b1368096d2a373b58fc1e7ca225a185042d93","created_at":1774560000000},
  {"id":81,"hash":"7547fe27e89532c2d5ae689c7cbc1a619868405e2431263bfb0527ad3b8cf0a0","created_at":1774563600000},
  {"id":82,"hash":"95102a9282f8fb4d7006c18bb1b8fb01fd6b39ee9fefaed4507cb064928b7ccf","created_at":1774650000000},
  {"id":83,"hash":"0f4e5ffaf59a72cd13cc5e2357131c5b6cb0fdfe0a85020ab0e3410f394b711e","created_at":1774653600000},
  {"id":84,"hash":"a2d7437db0539faab248813e2279b2f1601f979d268bb0d6b4649a2f66c954fc","created_at":1774750000000},
  {"id":85,"hash":"06ae6ff35493bc57c7cf43bb9f276df5b9b36ea639143789dcc4898a62876c68","created_at":1774760000000},
  {"id":86,"hash":"84f620b77fa737cce922c9e92b6141874e6d606e637920807994be57f020237a","created_at":1774770000000},
  {"id":87,"hash":"0f4e5ffaf59a72cd13cc5e2357131c5b6cb0fdfe0a85020ab0e3410f394b711e","created_at":1774780000000},
  {"id":88,"hash":"32c334c4f62a39e62cf6c66c389165d761559e2e4d431b5db6414213598e532e","created_at":1774790000000},
  {"id":89,"hash":"da25e8c9349d2b5ec0ceb23ceab92fe7c6dacb971d71e509b3018b359f5e8c08","created_at":1774800000000},
  {"id":90,"hash":"8a325b1810bd1afc137f0397d1cc96be47d1aa1924acc0beee27f9d8b39c7037","created_at":1774810000000},
  {"id":91,"hash":"6b47f9059b7781521eb05364465cd226c02cab8df424d593938c2f0e6a24a037","created_at":1774820000000},
  {"id":92,"hash":"8a714d5ae2e2957c77dd4fe7307292d9b534c1f1bb7815f9356b8680adeca693","created_at":1774830000000},
  {"id":100,"hash":"a125411fb5feab0f069328bd63cabebf23262a983c2b9d35af44d0ab9105a7f7","created_at":1774840000000},
  {"id":101,"hash":"5d6525e2f46bff7c82e3b0e39d1ec00576af9f30f975fa59f3b972a3c9077fb8","created_at":1774850000000},
  {"id":102,"hash":"3091e7af2193d60933f9dea45b03610f3ef685518968eca9a5425bc1bf326a7a","created_at":1775088000000},
  {"id":103,"hash":"dd9b577a296efef52dd7059ec9c864eb2f86abeec4047bb96c0280650ed0ecd4","created_at":1775350000000},
  {"id":104,"hash":"a31a13353b1f52467b679626b3a7e610f93ca2d080af9ae2451a997a0bce774b","created_at":1775360000000},
  {"id":105,"hash":"f4d94a89dae77b04afe363267e17aa714507f875d9eacb30b85aa02f16b0e568","created_at":1775370000000},
  {"id":106,"hash":"3635bd3fd88a2b8de71f93ab2119a0dd646388e5316cac8bc86326b3493e0986","created_at":1775550000000},
  {"id":107,"hash":"47f3f85fb081ca10078a846a66890e1ca80557f5c31594f9aec3095dd74dc932","created_at":1775560000000},
  {"id":108,"hash":"ac0574d3a4a6a9d2a78c66df67d81d198ab19d32569a23d46837b8c4aeaae5bc","created_at":1775570000000},
  {"id":109,"hash":"05ee5ba3a2fab64e623f90d3655480cfd8f400f54f7b9d84449944fd13a28396","created_at":1775580000000},
  {"id":110,"hash":"ad31f02ada73cf861f50cae202d7dd38fa6b5aed2a79c5bc88f797e2d7324b64","created_at":1775590000000},
  {"id":111,"hash":"112bcaa320058606f2330498b247a2a4f2231927d59908bac6a071c17e8793af","created_at":1775600000000},
  {"id":112,"hash":"6dd9ef328fc91208ccb7e189d329f37d1782958f45de0149e523af257a6c58bd","created_at":1775610000000},
  {"id":113,"hash":"bd38c68ebb47a8072ab27c767f4d4a8ae7b77a78e182d23589a72f157806d183","created_at":1775620000000},
  {"id":114,"hash":"6d28c76c267d9c4670b96a1ea81f7431c055b64785459c7a0d2e8b9f282c56f9","created_at":1775630000000},
  {"id":115,"hash":"9dd6a9f237ce742a07ebd0e3d1a45bc6e3f1c557bb67f03ede781da1a15d7f77","created_at":1775640000000},
  {"id":116,"hash":"1776da22e45aa68ea34625e16555201244429e2933cfe474c5ec839b34e8c799","created_at":1775650000000},
  {"id":117,"hash":"95f8a1e627de8c481bba527dec61fe0576cc81a3420abae9fe54d1551bb4bbd3","created_at":1775660000000},
  {"id":118,"hash":"411b6e52301bbd9645a21e6fd7f9af73ef048978f4b93f85e487360b2287297d","created_at":1775670000000},
  {"id":119,"hash":"fe0c4af38252374a69437e7614f599520897104c6db0877426507994e11c3c51","created_at":1775680000000},
  {"id":120,"hash":"746c7f080dc537265adc5fb390b5bac8ad256c38e91ecc5f209b33063b082a61","created_at":1775690000000},
  {"id":121,"hash":"b52c2409f92fa26220d778e46af2eb93dce6ead87bddf77d148f14fe5a82b2f3","created_at":1775700000000}
]
```

## Recovery procedure (only if rebaseline goes wrong)

To restore the original tracking table from this snapshot:

```sql
BEGIN;
TRUNCATE drizzle.__drizzle_migrations RESTART IDENTITY;
-- Then INSERT each row above using its hash + created_at.
-- (id is autoincrement; the original gaps at 57-58 and 93-99 cannot be restored,
-- but the only thing that matters for drizzle-kit migrate is hash uniqueness.)
COMMIT;
```

Note that an exact `id` restore would require `setval(pg_get_serial_sequence('drizzle.__drizzle_migrations', 'id'), 121)` after inserting; drizzle itself only checks hashes.

## Why this snapshot exists

On 2026-05-06 we re-baselined the Drizzle migration chain because the snapshot files (`migrations/meta/`) had drifted catastrophically from the SQL files: snapshots stopped being updated after `0024_*` while 86 more SQL migrations were authored manually, and `0021`–`0024` were byte-identical copies of `0020` with the same `id` (causing `drizzle-kit generate` to error with a parent-snapshot collision).

Re-baseline produced a single fresh baseline migration (`0000_nappy_guardian.sql`, hash `b9103b22375b49562c11a081a6213d68ce44b8bd8be91d55a4df2dd0017be35a`, folderMillis `1778104090479`) derived from `schema.ts`. The 121-row tracking table above was replaced with a single row containing that new hash, so drizzle-kit sees the baseline as already applied and future `migrate` runs are no-ops on prod.

Audit doc: see `docs/audits/sentry-observability-2026-05-06.md` for the related observability incident from the same day; the underlying drift class is the same one.
