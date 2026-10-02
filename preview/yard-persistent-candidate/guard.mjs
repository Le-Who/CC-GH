/** Candidate support must never register in the production process. */
export function requireCandidateMode() {
  if (process.env.YARD_CANDIDATE_CI !== '1' || process.env.NODE_ENV !== 'test') {
    throw new Error('YARD_CANDIDATE_CI=1 and NODE_ENV=test are required; production Yard remains active');
  }
}
