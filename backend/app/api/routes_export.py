"""POST /export — generate the enriched .xlsx and stream it back."""
from fastapi import APIRouter
from fastapi.responses import FileResponse

from ..logging_config import get_logger
from ..models.schemas import ExportRequest
from ..services import export_service
from .deps import require_session

router = APIRouter(tags=["export"])
log = get_logger("api.export")


@router.post("/export")
async def export(req: ExportRequest) -> FileResponse:
    session = require_session(req.session_id)
    path = export_service.export_xlsx(req.session_id, session["companies"], session["validation"], session["research"])
    log.info("Exported %s → %s", req.session_id, path.name)
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=path.name,
    )
