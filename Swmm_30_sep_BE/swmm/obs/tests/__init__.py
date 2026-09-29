"""The onboard-spares test suite, split into cohesive submodules.

`obs/tests.py` was a single 4,536-line flat file holding roughly twenty unrelated test
classes. This package splits it along its own natural seams with no behaviour change -
Django's test runner discovers `obs.tests` as a package the same way it discovered the
flat module, and every test class that existed before still runs.

Shared fixtures (`make_user`, `IMPORT_PASSWORD`, `MastersImportFixtureMixin`) live in
`_shared.py`, a module deliberately not named `test_*` so it is never collected as a test
module in its own right.
"""
