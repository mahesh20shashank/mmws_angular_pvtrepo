from django.contrib import admin

from .models import Ticket, TicketComment, TicketFile, TicketSequence


admin.site.register(Ticket)
admin.site.register(TicketComment)
admin.site.register(TicketFile)
admin.site.register(TicketSequence)
