// Runs AI extraction or matching for a list of candidate ids, a few at a time.
//
// kind       "extract" or "match"
// ids        candidate ids to process
// onProgress called before each batch with { from, to, total }
//
// Returns { doneIds, stopped }
//   doneIds  ids the backend processed successfully
//   stopped  null if everything went through, otherwise { message } explaining why we stopped
//
// Why stop at the first problem? When the AI is rate-limited, every further batch would
// also fail, and each failing batch can take minutes because the backend retries. It is
// better to stop and tell the user. Nothing is lost: the backend saves each candidate
// as soon as it is processed, and the rest stay retryable.

function friendlyProcessingError(error) {
  if (error.status === 0) {
    return "Lost the connection to the server. Processing may still be running there. Wait a minute, then refresh the candidates page.";
  }
  if (error.status === 502) {
    return "The AI service could not process this batch (usually a rate limit or a busy model). Your resumes are saved. Try again in a minute.";
  }
  return error.message;
}

async function runInChunks(kind, jobId, ids, onProgress) {
  const call = kind === "extract" ? API.extractCandidates : API.matchCandidates;
  const doneIds = [];
  let stopped = null;

  for (let start = 0; start < ids.length; start += CHUNK_SIZE) {
    const chunk = ids.slice(start, start + CHUNK_SIZE);
    if (onProgress) {
      onProgress({ from: start + 1, to: start + chunk.length, total: ids.length });
    }

    try {
      const processed = await call(jobId, chunk);
      processed.forEach((candidate) => doneIds.push(candidate.id));

      // The backend returns only the candidates it managed to process.
      if (processed.length < chunk.length) {
        stopped = {
          message:
            "The AI could not process every candidate in this batch (usually a rate limit). The rest are saved and can be retried.",
        };
        break;
      }
    } catch (error) {
      // 404 means "nothing waiting for this step" (already done earlier). Not a problem.
      if (error.status === 404) continue;
      stopped = { message: friendlyProcessingError(error) };
      break;
    }
  }

  return { doneIds, stopped };
}
