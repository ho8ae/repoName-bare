const execa = require('execa');
const path = require('path');
const fs = require('fs');

/**
 * 워크트리 목록 조회
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<Array<{path: string, name: string, branch: string, isBare: boolean}>>}
 */
async function getWorktrees(bareDir) {
  try {
    const { stdout } = await execa('git', ['-C', bareDir, 'worktree', 'list']);
    const lines = stdout.split('\n').filter(line => line.trim());

    return lines.map(line => {
      const parts = line.split(/\s+/);
      const wtPath = parts[0];
      const name = path.basename(wtPath);
      const isBare = line.includes('(bare)');

      // 브랜치명 추출
      let branch = '';
      const branchMatch = line.match(/\[([^\]]+)\]/);
      if (branchMatch) {
        branch = branchMatch[1];
      }

      return { path: wtPath, name, branch, isBare };
    });
  } catch (error) {
    return [];
  }
}

/**
 * 워크트리 목록 (bare 제외)
 * @param {string} bareDir - bare 저장소 경로
 * @returns {Promise<Array<{path: string, name: string, branch: string}>>}
 */
async function getWorktreesExcludeBare(bareDir) {
  const worktrees = await getWorktrees(bareDir);
  return worktrees.filter(wt => !wt.isBare);
}

/**
 * 새 브랜치와 함께 워크트리 생성
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 생성할 폴더명
 * @param {string} newBranch - 새 브랜치명
 * @param {string} baseBranch - 기반 브랜치
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createWorktreeWithNewBranch(bareDir, folder, newBranch, baseBranch) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    await execa('git', ['-C', bareDir, 'worktree', 'add', '-b', newBranch, worktreePath, `origin/${baseBranch}`]);

    // upstream 해제 (base 브랜치에 실수로 push 방지)
    if (fs.existsSync(worktreePath)) {
      await execa('git', ['-C', worktreePath, 'branch', '--unset-upstream'], { reject: false });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 기존 브랜치로 워크트리 생성
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 생성할 폴더명
 * @param {string} branch - 브랜치명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createWorktreeWithExistingBranch(bareDir, folder, branch) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    // 먼저 로컬 브랜치로 시도, 실패하면 원격 브랜치에서 생성
    try {
      await execa('git', ['-C', bareDir, 'worktree', 'add', '-b', branch, worktreePath, `origin/${branch}`]);
    } catch {
      await execa('git', ['-C', bareDir, 'worktree', 'add', worktreePath, branch]);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 워크트리 삭제
 * @param {string} bareDir - bare 저장소 경로
 * @param {string} folder - 삭제할 폴더명
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeWorktree(bareDir, folder) {
  const rootDir = path.dirname(bareDir);
  const worktreePath = path.join(rootDir, folder);

  try {
    await execa('git', ['-C', bareDir, 'worktree', 'remove', worktreePath, '--force']);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.stderr || error.message };
  }
}

/**
 * 워크트리의 현재 브랜치 조회
 * @param {string} worktreePath - 워크트리 경로
 * @returns {Promise<string>}
 */
async function getWorktreeBranch(worktreePath) {
  try {
    const { stdout } = await execa('git', ['-C', worktreePath, 'branch', '--show-current']);
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * 워크트리에 커밋 안 된 변경이 있는지 확인
 * @param {string} worktreePath - 워크트리 경로
 * @returns {Promise<boolean>}
 */
async function isWorktreeDirty(worktreePath) {
  try {
    const { stdout } = await execa('git', ['-C', worktreePath, 'status', '--short'], { reject: false });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

module.exports = {
  getWorktrees,
  getWorktreesExcludeBare,
  createWorktreeWithNewBranch,
  createWorktreeWithExistingBranch,
  removeWorktree,
  getWorktreeBranch,
  isWorktreeDirty
};
