

from deps import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    RawResponse,
    UploadFile,
    _razorpay,  # noqa: F401
    current_user,
    datetime,
    db,
    get_object,
    oid,
    put_object,
    timezone,
    upload_path,
)

router = APIRouter()


@router.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(current_user)):
    path, content_type = upload_path(user["id"], file.filename or "file.bin")
    data = await file.read()
    if len(data) > 200 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 200MB)")
    allowed_mime = {"image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"}
    if (file.content_type or content_type) not in allowed_mime:
        raise HTTPException(400, "Only JPG, PNG, WEBP, GIF and MP4 files are allowed")
    result = put_object(path, data, file.content_type or content_type)
    await db.files.insert_one({
        "storage_path": result["path"], "original_filename": file.filename,
        "content_type": file.content_type or content_type, "size": result["size"],
        "uploader_id": oid(user["id"]), "is_deleted": False,
        "created_at": datetime.now(timezone.utc),
    })
    return {"path": result["path"], "url": f"/api/files/{result['path']}"}


@router.get("/files/{path:path}")
async def serve_file(path: str):
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(404, "File not found")
    data, content_type = get_object(path)
    return RawResponse(content=data, media_type=record.get("content_type", content_type))
