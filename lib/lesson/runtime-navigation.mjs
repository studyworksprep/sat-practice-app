function clampIndex(index, total) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(index, total - 1));
}

export function buildBlockIndexMap(blocks = []) {
  const map = new Map();
  blocks.forEach((block, index) => {
    if (block?.id == null) return;
    map.set(String(block.id), index);
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
        sourceBlockId: block?.id != null ? String(block.id) : null,
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
  const linearNextIndex = clampIndex(currentIndex + 1, totalBlocks);
  let nextIndex = linearNextIndex;
  let nextBranchState = activeBranchState;

  const blockRejoinId = current?.content?.rejoin_at_block_id != null
    ? String(current.content.rejoin_at_block_id)
    : null;

  if (
    nextBranchState?.sourceBlockId
    && current?.id != null
    && String(current.id) === String(nextBranchState.chosenBlockId)
    && nextBranchState.rejoinBlockId
    && String(nextBranchState.rejoinBlockId) !== String(current.id)
  ) {
    const rejoinIdx = blockIndexById.get(String(nextBranchState.rejoinBlockId));
    if (Number.isInteger(rejoinIdx)) {
      nextIndex = rejoinIdx;
    }
  } else if (blockRejoinId && current?.id != null && blockRejoinId !== String(current.id)) {
    const rejoinIdx = blockIndexById.get(blockRejoinId);
    if (Number.isInteger(rejoinIdx)) {
      nextIndex = rejoinIdx;
    }
  }

  if (nextBranchState?.rejoinBlockId && current?.id != null && String(current.id) === String(nextBranchState.rejoinBlockId)) {
    nextBranchState = null;
  }

  return { nextIndex, activeBranchState: nextBranchState };
}
