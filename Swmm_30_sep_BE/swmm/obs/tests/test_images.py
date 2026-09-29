"""Import picture-handling tests: `ImportedPictureTests`, `ResolveImportImageTests`,
`SpareImageUploadPathTests`.

Split out of the former flat `obs/tests.py` (Part 1 of the obs file-structure split).
"""

import json
import os
import shutil
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from openpyxl import Workbook
from rest_framework import status
from rest_framework.test import APITestCase

from .. import excel, services
from ..models import Authority, Denomination, EquipmentClass, SpareClass, Spares
from ..utils import spare_image_upload_path
from .test_import_rules import ImportColumnVocabularyTests
from ._shared import IMPORT_PASSWORD, MastersImportFixtureMixin, make_user


class ImportedPictureTests(MastersImportFixtureMixin, APITestCase):
    """The PICTURE PATH column - opened by the server, not merely shown and thrown away."""

    IMPORT_PREVIEW_URL = "/api/v1/onboard-spares/spares/import-excel-preview/"
    IMPORT_COMMIT_URL = "/api/v1/onboard-spares/spares/import-excel-commit-valid/"

    HEADERS = ImportColumnVocabularyTests.TEMPLATE_HEADERS
    PICTURE_COLUMN = 17

    def setUp(self):
        super().setUp()
        self.department = self._department("ENGINEERING")
        self._login_for(self.department)
        self.spare_class = SpareClass.objects.create(
            name="SPARES_EQUIPMENT",
            department=self.department,
        )
        Denomination.objects.create(name="NOS", department=self.department)
        Authority.objects.create(name="MO ITEM")
        # Each case gets its own MEDIA_ROOT, so an attached image is written to a directory
        # that goes away with the test rather than into the developer's own media folder.
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, True)
        self.pictures = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.pictures, True)

    def _picture(self, name="1.JPG"):
        """A real image file on disk - real, because `resolve_import_image` opens it with
        Pillow, and a handful of bytes carrying the right extension is exactly what it must
        refuse."""
        from PIL import Image

        path = os.path.join(self.pictures, name)
        Image.new("RGB", (4, 4), (200, 30, 30)).save(path, "JPEG")
        return path

    def _row(self, picture_path=""):
        row = [
            1,
            "SPARES_EQUIPMENT",
            "CHILLED WATER PUMP",
            "",
            "SHAFT SLEEVE",
            "P",
            "NOS",
            2,
            2,
            "FWD SG STORE",
            "PORT",
            "3",
            "101A",
            "MO ITEM",
            "",
            "",
            "",
            "",
            "",
            "4121",
        ]
        row[self.PICTURE_COLUMN] = picture_path
        return row

    def _post(self, url, *rows, extra=None):
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = "OBS"
        worksheet.append(list(self.HEADERS))
        for row in rows:
            worksheet.append(list(row))
        content = BytesIO()
        workbook.save(content)
        body = {
            "file": SimpleUploadedFile("pictures.xlsx", content.getvalue()),
            "route": services.IMPORT_ROUTE_OTHERS,
            "authority": "MO ITEM",
            "password": IMPORT_PASSWORD,
        }
        body.update(extra or {})
        return self.client.post(url, body, format="multipart")

    # ---------------------------------------------------------------- the commit

    def test_a_readable_picture_path_becomes_the_spares_image(self):
        """The path in the sheet is opened, the bytes are stored, and the spare's image is no
        longer the default."""
        picture = self._picture()

        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(self.IMPORT_COMMIT_URL, self._row(picture))

            self.assertEqual(response.data["imported"], 1)
            self.assertEqual(response.data["images_attached"], 1)
            self.assertEqual(response.data["images_skipped"], 0)

            spare = Spares.objects.get()
            self.assertNotEqual(spare.image.name, "obs/default.png")
            self.assertTrue(os.path.isfile(spare.image.path))
            self.assertGreater(spare.image.size, 0)

    def test_the_image_is_filed_by_department_then_spare_class_then_equipment_class(self):
        """The folder structure the ship asked for."""
        picture = self._picture()

        with self.settings(MEDIA_ROOT=self.media_root):
            self._post(self.IMPORT_COMMIT_URL, self._row(picture))
            stored = Spares.objects.get().image.name

        self.assertTrue(
            stored.startswith("obs/ENGINEERING/SPARES_EQUIPMENT/CHILLED WATER PUMP/"),
            msg=f"filed at {stored}",
        )
        self.assertTrue(stored.endswith(".jpg"))

    def test_a_path_that_cannot_be_read_saves_the_row_anyway_with_the_default(self):
        """A missing photograph is not a defect in the row's inventory data."""
        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(
                self.IMPORT_COMMIT_URL, self._row("D:\\NOT THERE\\1.JPG")
            )

            self.assertEqual(response.data["imported"], 1)
            self.assertEqual(response.data["images_attached"], 0)
            self.assertEqual(response.data["images_skipped"], 1)
            self.assertEqual(Spares.objects.get().image.name, "obs/default.png")

    def test_a_blank_picture_path_is_not_counted_as_a_skipped_image(self):
        """Most rows of most sheets carry no picture at all."""
        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(self.IMPORT_COMMIT_URL, self._row(""))

            self.assertEqual(response.data["imported"], 1)
            self.assertEqual(response.data["images_attached"], 0)
            self.assertEqual(response.data["images_skipped"], 0)

    # ---------------------------------------------------------------- the preview

    def test_the_preview_advises_on_an_unreadable_path_without_failing_the_row(self):
        """The operator hears about it BEFORE committing, and hears it as an advisory - the
        row stays green, because there is nothing wrong with it."""
        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(
                self.IMPORT_PREVIEW_URL, self._row("D:\\NOT THERE\\1.JPG")
            )

        row = response.data["rows"][0]
        self.assertEqual(row["status"], "valid")
        self.assertIsNone(row["errors"])
        advisory = row["advisories"]["picture_path"][0]
        self.assertIn("D:\\NOT THERE\\1.JPG", advisory)
        self.assertIn("default photo", advisory)

    def test_the_preview_says_nothing_about_a_path_it_can_read(self):
        picture = self._picture()

        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(self.IMPORT_PREVIEW_URL, self._row(picture))

        row = response.data["rows"][0]
        self.assertEqual(row["status"], "valid")
        self.assertIsNone((row["advisories"] or {}).get("picture_path"))

    def test_the_preview_writes_no_image(self):
        """`_classify_import_rows_guarded` rolls its transaction back, and the preview must
        not leave a file behind that no row references."""
        picture = self._picture()

        with self.settings(MEDIA_ROOT=self.media_root):
            self._post(self.IMPORT_PREVIEW_URL, self._row(picture))

        self.assertFalse(
            os.path.exists(os.path.join(self.media_root, "obs", "ENGINEERING")),
            msg="the preview wrote an image into MEDIA_ROOT",
        )

    # ---------------------------------------------------------------- the working table

    def test_the_picture_path_can_be_corrected_in_the_working_table(self):
        """The ways this column fails are the SERVER's - an unshared folder, the operator's
        own drive letter, a renamed file - and none of them is visible until the preview has
        reported it. The cell is editable so the operator can answer that report where they
        are reading it, rather than closing the screen and editing the workbook."""
        picture = self._picture()

        with self.settings(MEDIA_ROOT=self.media_root):
            response = self._post(
                self.IMPORT_COMMIT_URL,
                self._row("D:\\WRONG\\1.JPG"),
                # Row 2 - row 1 is the header. The same shape the working table posts.
                extra={"edits": json.dumps({"2": {"picture_path": picture}})},
            )

            self.assertEqual(response.data["imported"], 1)
            self.assertEqual(
                response.data["images_attached"],
                1,
                msg="the corrected path was ignored and the workbook's own was used",
            )
            self.assertNotEqual(Spares.objects.get().image.name, "obs/default.png")




class ResolveImportImageTests(SimpleTestCase):
    """The checks between a client-supplied path and the server's filesystem."""

    def setUp(self):
        self.folder = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.folder, True)

    def _write_image(self, name="photo.jpg", fmt="JPEG"):
        from PIL import Image

        path = os.path.join(self.folder, name)
        Image.new("RGB", (4, 4), (10, 90, 200)).save(path, fmt)
        return path

    def test_a_blank_cell_is_not_a_problem_and_is_not_reported(self):
        self.assertEqual(excel.resolve_import_image(""), (None, None))
        self.assertEqual(excel.resolve_import_image(None), (None, None))
        self.assertEqual(excel.resolve_import_image("   "), (None, None))

    def test_a_real_image_comes_back_named_after_the_file_on_disk(self):
        """The NAME matters as much as the bytes: `spare_image_upload_path` reads the
        extension off it to decide whether to file the image at all."""
        path = self._write_image("1.JPG")

        picture, reason = excel.resolve_import_image(path)

        self.assertIsNone(reason)
        self.assertEqual(picture.name, "1.JPG")
        self.assertGreater(picture.size, 0)

    def test_a_missing_file_is_a_sentence_naming_the_path(self):
        picture, reason = excel.resolve_import_image(
            os.path.join(self.folder, "gone.jpg")
        )

        self.assertIsNone(picture)
        self.assertIn("gone.jpg", reason)

    def test_an_extension_outside_the_three_is_refused(self):
        path = os.path.join(self.folder, "notes.txt")
        with open(path, "w") as handle:
            handle.write("hello")

        picture, reason = excel.resolve_import_image(path)

        self.assertIsNone(picture)
        self.assertIn(".png, .jpg or .jpeg", reason)

    def test_a_file_that_is_not_really_an_image_is_refused(self):
        """An executable renamed `.jpg` passes every check but this one."""
        path = os.path.join(self.folder, "trojan.jpg")
        with open(path, "wb") as handle:
            handle.write(b"MZ\x90\x00" + b"\x00" * 64)

        picture, reason = excel.resolve_import_image(path)

        self.assertIsNone(picture)
        self.assertIn("not a readable image", reason)

    def test_a_file_over_the_size_limit_is_refused(self):
        path = self._write_image()

        with self.settings(OBS_IMAGE_IMPORT_MAX_BYTES=1):
            picture, reason = excel.resolve_import_image(path)

        self.assertIsNone(picture)
        self.assertIn("larger than", reason)

    def test_a_path_outside_the_configured_roots_is_refused(self):
        path = self._write_image()
        elsewhere = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, elsewhere, True)

        with self.settings(OBS_IMAGE_IMPORT_ROOTS=[elsewhere]):
            picture, reason = excel.resolve_import_image(path)
        self.assertIsNone(picture)
        self.assertIn("outside the folders", reason)

        with self.settings(OBS_IMAGE_IMPORT_ROOTS=[self.folder]):
            picture, reason = excel.resolve_import_image(path)
        self.assertIsNone(reason)
        self.assertIsNotNone(picture)

    def test_read_bytes_false_runs_every_check_and_loads_nothing(self):
        good = self._write_image()

        self.assertEqual(
            excel.resolve_import_image(good, read_bytes=False), (None, None)
        )
        picture, reason = excel.resolve_import_image(
            os.path.join(self.folder, "gone.jpg"), read_bytes=False
        )
        self.assertIsNone(picture)
        self.assertIn("gone.jpg", reason)




class SpareImageUploadPathTests(SimpleTestCase):
    """The folder a spare image is filed under."""

    class _FakeDepartment:
        def __init__(self, name):
            self.name = name

    class _FakeSpareClass:
        def __init__(self, name, department):
            self.name = name
            self.department = department

    class _FakeEquipmentClass:
        def __init__(self, name, spare_class, department):
            self.name = name
            self.spare_class = spare_class
            self.department = department

    class _FakeSpare:
        def __init__(self, equipment_class):
            self.equipment_class = equipment_class

    def _spare(self, department="ENGINEERING", spare_class="SPARES_EQUIPMENT",
               equipment_class="AIR CONDITIONING PLANT", department_on_class=True):
        department_row = self._FakeDepartment(department) if department else None
        spare_class_row = self._FakeSpareClass(spare_class, department_row)
        equipment_row = self._FakeEquipmentClass(
            equipment_class,
            spare_class_row,
            department_row if department_on_class else None,
        )
        return self._FakeSpare(equipment_row)

    def test_the_three_folders_are_department_then_spare_class_then_equipment_class(self):
        path = spare_image_upload_path(self._spare(), "1.JPG")

        self.assertTrue(
            path.startswith("obs/ENGINEERING/SPARES_EQUIPMENT/AIR CONDITIONING PLANT/")
        )
        self.assertTrue(path.endswith(".jpg"))

    def test_the_department_falls_back_to_the_spare_classs_own(self):
        """`EquipmentClass.department` is derived in `clean()` and is nullable only so its
        migration could be applied before the backfill ran."""
        path = spare_image_upload_path(self._spare(department_on_class=False), "1.jpg")

        self.assertTrue(path.startswith("obs/ENGINEERING/"))

    def test_a_spare_with_no_department_at_all_is_filed_under_unassigned(self):
        """Rather than raising. An image is never worth failing a save over."""
        path = spare_image_upload_path(self._spare(department=None), "1.jpg")

        self.assertTrue(path.startswith("obs/UNASSIGNED/"))

    def test_a_master_name_cannot_escape_the_obs_folder(self):
        """These three segments are names an operator typed. A separator or a `..` in one of
        them would file the image outside the folder it belongs in."""
        path = spare_image_upload_path(
            self._spare(department="../../etc", equipment_class="A/B\\C"),
            "1.jpg",
        )

        self.assertNotIn("..", path)
        self.assertTrue(path.startswith("obs/"))
        self.assertEqual(len(path.split("/")), 5, msg=path)

    def test_an_extension_outside_the_three_still_answers_the_default(self):
        self.assertEqual(
            spare_image_upload_path(self._spare(), "1.gif"), "obs/default.png"
        )
