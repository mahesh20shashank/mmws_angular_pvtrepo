"""The wlms test suite, split into cohesive submodules.

`wlms/tests.py` was a single 1,175-line flat file holding one `WLMSApiFlowTests` class
whose `setUp` was reused, unchanged, by every one of its 37 test methods. This package
splits it along its own natural seams - matching the `wlms/views/` package split -
with no behaviour change. Django's test runner discovers `wlms.tests` as a package the
same way it discovered the flat module, and every test that existed before still runs.

The shared fixture (`WLMSApiFixtureMixin`, the department/user/equipment/spare/routine
setUp every test method needs) lives in `_shared.py`, a module deliberately not named
`test_*` so it is never collected as a test module in its own right (mirrors
`obs/tests/_shared.py`'s pattern).
"""
