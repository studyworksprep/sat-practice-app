function clampIndex(index, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

// The identity a block is navigated by. Branch fields
// (on_correct_block_id, etc.) reference the author-facing content id,
// which is preserved verbatim through the save→reload cycle — whereas
// block.id is a fresh database row id assigned on insert. So resolve
// navigation by content.id when present, falling back to block.id for
// blocks that have no content id.
function navId(block) {
  const cid = block?.content?.id;
  if (cid != null && String(cid) !== '') return String(cid);
  return block?.id != null ? String(block.id) : '';
}

export function buildBlockIndexMap(blocks = []) {
  const map = new Map();
  // Index content ids first (the stable branch-target identity), then
  // fill in block ids for anything without a content id. A content id
  // wins on collision because that's what branch fields point at.
  blocks.forEach((block, index) => {
    const cid = block?.content?.id;
    if (cid != null && String(cid) !== '' && !map.has(String(cid))) {
      map.set(String(cid), index);
    }
  });
  blocks.forEach((block, index) => {
    if (block?.id != null && !map.has(String(block.id))) {
      map.set(String(block.id), index);
    }
  });
  return map;
}

export function resolveAnswerNavigation({
  block,
  isCorrect,
  currentIndex = 0,
  totalBlocks = 0,
  blockIndexById = new Map(),
}) {
  const content = block?.content || {};
  const targetId = isCorrect ? content.on_correct_block_id : content.on_incorrect_block_id;
  const linearNextIndex = clampIndex(currentIndex + 1, totalBlocks);
  const targetIndex = targetId != null ? blockIndexById.get(String(targetId)) : null;

  if (Number.isInteger(targetIndex)) {
    return {
      nextIndex: targetIndex,
      activeBranchState: {
        sourceBlockId: navId(block) || null,
        chosenBlockId: String(targetId),
        rejoinBlockId: content.rejoin_at_block_id != null ? String(content.rejoin_at_block_id) : null,
      },
      targetResolved: true,
    };
  }

  return {
    nextIndex: linearNextIndex,
    activeBranchState: null,
    targetResolved: false,
  };
}

export function resolveContinueNavigation({
  blocks = [],
  currentIndex = 0,
  activeBranchState = null,
  blockIndexById = new Map(),
}) {
  const totalBlocks = blocks.length;
  if (totalBlocks === 0) {
    return { nextIndex: 0, activeBranchState: null };
  }

  const current = blocks[currentIndex] || null;
  const currentId = navId(current);
  const linearNextIndex = clampIndex(currentIndex + 1, totalBlocks);
  let nextIndex = linearNextIndex;
  let nextBranchState = activeBranchState;

  const blockRejoinId = current?.content?.rejoin_at_block_id != null
    ? String(current.content.rejoin_at_block_id)
    : null;

  if (
    nextBranchState?.sourceBlockId
    && currentId
    && currentId === String(nextBranchState.chosenBlockId)
    && nextBranchState.rejoinBlockId
    && String(nextBranchState.rejoinBlockId) !== currentId
  ) {
    const rejoinIdx = blockIndexById.get(String(nextBranchState.rejoinBlockId));
    if (Number.isInteger(rejoinIdx)) {
      nextIndex = rejoinIdx;
    }
  } else if (blockRejoinId && currentId && blockRejoinId !== currentId) {
    const rejoinIdx = blockIndexById.get(blockRejoinId);
    if (Number.isInteger(rejoinIdx)) {
      nextIndex = rejoinIdx;
    }
  }

  if (nextBranchState?.rejoinBlockId && currentId && currentId === String(nextBranchState.rejoinBlockId)) {
    nextBranchState = null;
  }

  return { nextIndex, activeBranchState: nextBranchState };
}
