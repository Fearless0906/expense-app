from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("expenses.urls")),
    path("", RedirectView.as_view(url="/api/")),  # the bare address shows the API overview
]

# Profile photos. In production let the web server (or object storage) serve MEDIA_ROOT instead.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
