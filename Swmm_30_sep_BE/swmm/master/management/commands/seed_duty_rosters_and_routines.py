from datetime import date

from accounts.models import CustomUserProfile, Rank
from django.core.management.base import BaseCommand
from ems.models import UniqueRoutineName
from master.models import Department, HierarchyForChart, OrderDuty


class Command(BaseCommand):
    help = "Seed duty rosters and routines data"

    def handle(self, *args, **options):
        # Seed Personnel
        personnel_data = [
            {
                "firstname": "Captain",
                "lastname": "Singh",
                "personal_number": "P001",
            },
            {
                "firstname": "Commander",
                "lastname": "Sharma",
                "personal_number": "P002",
            },
            {
                "firstname": "Lt. Commander",
                "lastname": "Patel",
                "personal_number": "P003",
            },
            {
                "firstname": "Lieutenant",
                "lastname": "Kumar",
                "personal_number": "P004",
            },
            {
                "firstname": "Sub-Lieutenant",
                "lastname": "Gupta",
                "personal_number": "P005",
            },
            {
                "firstname": "Midshipman",
                "lastname": "Verma",
                "personal_number": "P006",
            },
            {
                "firstname": "Chief Petty Officer",
                "lastname": "Reddy",
                "personal_number": "P007",
            },
            {
                "firstname": "Petty Officer",
                "lastname": "Nair",
                "personal_number": "P008",
            },
        ]

        for personnel in personnel_data:
            obj, created = CustomUserProfile.objects.get_or_create(
                personal_number=personnel["personal_number"],
                defaults={
                    "firstname": personnel["firstname"],
                    "lastname": personnel["lastname"],
                },
            )
            status = "Created" if created else "Already exists"
            full_name = f"{personnel['firstname']} {personnel['lastname']}"
            self.stdout.write(self.style.SUCCESS(f"{status}: {full_name}"))

        # Seed Duty Rosters
        duty_roster_data = [
            {
                "filename": "Duty Roster 2026-08",
                "source": "duty roster",
                "roster_name": "Monthly Roster August 2026",
                "from_date": date(2026, 8, 1),
                "to_date": date(2026, 8, 31),
                "description": "Duty roster for August 2026",
            },
            {
                "filename": "Duty Roster 2026-09",
                "source": "duty roster",
                "roster_name": "Monthly Roster September 2026",
                "from_date": date(2026, 9, 1),
                "to_date": date(2026, 9, 30),
                "description": "Duty roster for September 2026",
            },
            {
                "filename": "Weekly Roster Week 33",
                "source": "duty roster",
                "roster_name": "Weekly Roster Week 33",
                "from_date": date(2026, 8, 17),
                "to_date": date(2026, 8, 23),
                "description": "Weekly duty roster for week 33",
            },
        ]

        for roster in duty_roster_data:
            obj, created = OrderDuty.objects.get_or_create(
                filename=roster["filename"],
                source=roster["source"],
                defaults={
                    "roster_name": roster.get("roster_name"),
                    "from_date": roster.get("from_date"),
                    "to_date": roster.get("to_date"),
                    "description": roster.get("description"),
                },
            )
            status = "Created" if created else "Already exists"
            self.stdout.write(self.style.SUCCESS(f"{status}: {roster['filename']}"))

        # Seed Regulators Hierarchy
        try:
            # Create/get Department
            dept, _ = Department.objects.get_or_create(
                name="Engineering", defaults={"code": "ENG", "dep_code": "ENG"}
            )

            # Create/get Ranks
            ranks_data = {
                "captain": Rank.objects.get_or_create(name="Captain")[0],
                "commander": Rank.objects.get_or_create(name="Commander")[0],
                "lt_commander": Rank.objects.get_or_create(name="Lt. Commander")[0],
                "lieutenant": Rank.objects.get_or_create(name="Lieutenant")[0],
            }

            # Create/get Users with Regulator flag
            regulators_data = [
                {
                    "name": "Capt. James Wilson",
                    "firstname": "James",
                    "lastname": "Wilson",
                    "personal_number": "REG001",
                    "rank": ranks_data["captain"],
                },
                {
                    "name": "Cdr. Sarah Johnson",
                    "firstname": "Sarah",
                    "lastname": "Johnson",
                    "personal_number": "REG002",
                    "rank": ranks_data["commander"],
                },
                {
                    "name": "Lt.Cdr. Michael Brown",
                    "firstname": "Michael",
                    "lastname": "Brown",
                    "personal_number": "REG003",
                    "rank": ranks_data["lt_commander"],
                },
                {
                    "name": "Lt. Robert Davis",
                    "firstname": "Robert",
                    "lastname": "Davis",
                    "personal_number": "REG004",
                    "rank": ranks_data["lieutenant"],
                },
            ]

            for reg in regulators_data:
                # Create or update user profile
                profile, _ = CustomUserProfile.objects.get_or_create(
                    personal_number=reg["personal_number"],
                    defaults={
                        "firstname": reg["firstname"],
                        "lastname": reg["lastname"],
                        "rank": reg["rank"],
                        "department": dept,
                        "is_regulator": True,
                    },
                )

                # Create HierarchyForChart node
                hierarchy, created = HierarchyForChart.objects.get_or_create(
                    name=reg["name"],
                    defaults={
                        "user": profile,
                        "is_regulator": True,
                    },
                )
                status = "Created" if created else "Already exists"
                self.stdout.write(
                    self.style.SUCCESS(f"{status} Regulator: {reg['name']}")
                )

        except Exception as e:
            self.stdout.write(self.style.WARNING(f"Could not seed regulators: {e!s}"))

        # Seed Routines
        routine_names = [
            "Engine Room Log Check",
            "Fuel Tank Inspection",
            "Water Quality Test",
            "Daily Equipment Inspection",
            "Safety System Check",
            "Navigation System Test",
            "Communication Equipment Check",
            "Deck Maintenance",
            "Hull Condition Report",
            "Machinery Lubrication",
        ]

        for routine_name in routine_names:
            obj, created = UniqueRoutineName.objects.get_or_create(
                name=routine_name, defaults={"name": routine_name}
            )
            status = "Created" if created else "Already exists"
            self.stdout.write(self.style.SUCCESS(f"{status}: {routine_name}"))

        # Seed Gallery Images
        # gallery_data = [
        #     {
        #         "title": "Ship at Sea",
        #         "caption": "Our ship sailing across the ocean",
        #         "image": "https://via.placeholder.com/800x600?text=Ship+at+Sea",
        #     },
        #     {
        #         "title": "Crew Assembly",
        #         "caption": "Crew members assembled on deck",
        #         "image": "https://via.placeholder.com/800x600?text=Crew+Assembly",
        #     },
        #     {
        #         "title": "Engine Room",
        #         "caption": "Main engine room operations",
        #         "image": "https://via.placeholder.com/800x600?text=Engine+Room",
        #     },
        #     {
        #         "title": "Sunset View",
        #         "caption": "Beautiful sunset from the bridge",
        #         "image": "https://via.placeholder.com/800x600?text=Sunset+View",
        #     },
        #     {
        #         "title": "Navigation Bridge",
        #         "caption": "Modern navigation equipment",
        #         "image": "https://via.placeholder.com/800x600?text=Navigation+Bridge",
        #     },
        # ]

        # for gallery in gallery_data:
        #     obj, created = GalleryImage.objects.get_or_create(
        #         title=gallery["title"],
        #         defaults={
        #             "caption": gallery["caption"],
        #             "image": gallery["image"],
        #         },
        #     )
        #     status = "Created" if created else "Already exists"
        #     self.stdout.write(
        #         self.style.SUCCESS(f"{status} Gallery: {gallery['title']}")
        #     )

        self.stdout.write(self.style.SUCCESS("Successfully seeded all data!"))
