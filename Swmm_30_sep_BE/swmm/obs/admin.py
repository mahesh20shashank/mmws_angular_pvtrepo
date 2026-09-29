from django.contrib import admin

from .models import (
    Authority,
    Demand,
    Denomination,
    EquipmentClass,
    ImportRulesDocument,
    Issue,
    IssueList,
    NotInCattedItem,
    PlannedRoutineSpareList,
    PostDemand,
    PostReceive,
    PostSurvey,
    Receive,
    Return,
    RoutineSpareUsage,
    SpareClass,
    Spares,
    SparesMapping,
    Survey,
)

admin.site.register(SpareClass)
admin.site.register(EquipmentClass)
admin.site.register(Denomination)
admin.site.register(Authority)
admin.site.register(Spares)
admin.site.register(RoutineSpareUsage)
admin.site.register(Issue)
admin.site.register(IssueList)
admin.site.register(Return)
admin.site.register(Survey)
admin.site.register(PostSurvey)
admin.site.register(Demand)
admin.site.register(PostDemand)
admin.site.register(Receive)
admin.site.register(PostReceive)
admin.site.register(PlannedRoutineSpareList)
admin.site.register(SparesMapping)
admin.site.register(NotInCattedItem)
admin.site.register(ImportRulesDocument)
