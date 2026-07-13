"""POST /upload — parse an .xlsx, validate, build the research queue, open a session."""
from fastapi import APIRouter, File, HTTPException, UploadFile

from ..database import repository
from ..logging_config import get_logger
from ..models import company as company_model
from ..models.schemas import UploadResponse
from ..services import duplicate_service, excel_service, research_queue

router = APIRouter(tags=["ingestion"])
log = get_logger("api.upload")


@router.post("/upload", response_model=UploadResponse)
async def upload(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Please upload a .xlsx file.")
    data = await file.read()
    try:
        parsed = excel_service.parse_bytes(data)
    except Exception as exc:  # noqa: BLE001
        log.exception("Excel parse failed")
        raise HTTPException(status_code=422, detail=f"Could not read the workbook: {exc}")
    if parsed.get("error"):
        raise HTTPException(status_code=422, detail=parsed["error"])

    companies = company_model.build_companies(parsed["companies"])
    validation = duplicate_service.analyze(companies)
    research = research_queue.build(companies, validation)

    sid = repository.create_session({
        "file_name": file.filename, "sheet_name": parsed.get("sheetName"),
        "mapping": parsed["mapping"], "skipped": parsed["skipped"],
        "companies": companies, "validation": validation, "research": research,
    })
    log.info("Upload %s: %s companies, %s skipped", sid, len(companies), parsed["skipped"])
    return UploadResponse(
        session_id=sid, file_name=file.filename, extracted=len(companies), skipped=parsed["skipped"],
        mapping=parsed["mapping"], validation_summary=validation["summary"],
        research_summary=research_queue.stats(research["jobs"]),
    )
