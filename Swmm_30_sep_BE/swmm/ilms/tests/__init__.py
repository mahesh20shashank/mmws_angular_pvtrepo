"""The ilms test suite, split into cohesive submodules.

`ilms/tests.py` was a single 919-line flat file holding one `ILMSApiFlowTests` class
whose `setUp` was reused, unchanged, by every one of its 32 test methods. This package
splits it along its own natural seams - matching the `ilms/views/` package split -
with no behaviour change. Django's test runner discovers `ilms.tests` as a package the
same way it discovered the flat module, and every test that existed before still runs.

The shared fixture (`ILMSApiFixtureMixin`, the user/item/vendor/equipment/routine
setUp every test method needs) lives in `_shared.py`, a module deliberately not named
`test_*` so it is never collected as a test module in its own right (mirrors
`wlms/tests/_shared.py`'s and `obs/tests/_shared.py`'s pattern).

There are no tests exercising `WedInventoryViewSet` in the original flat file, so unlike
`views/wed_inventory.py` there is no `test_wed_inventory.py` counterpart here.
"""
