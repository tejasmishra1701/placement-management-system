'use strict';
// SelectionController: round results and final offers (UC-011, UC-013).
module.exports = function registerSelectionController(router, { auth, selection }) {
  router.post('/api/applications/:applicationId/rounds/:roundId/result', (ctx) => {
    const p = auth.authorize(ctx.token, 'UPDATE_ROUND_RESULT');
    return { candidate: selection.updateRoundResult(p, ctx.params.applicationId, ctx.params.roundId, ctx.body.result) };
  });

  router.post('/api/applications/:applicationId/offer', (ctx) => {
    const p = auth.authorize(ctx.token, 'RECORD_OFFER');
    return { offer: selection.recordOffer(p, ctx.params.applicationId, ctx.body.ctcLpa, ctx.body.offerDate, ctx.body.overwriteOk === true) };
  });

  router.post('/api/applications/:applicationId/not-offered', (ctx) => {
    const p = auth.authorize(ctx.token, 'RECORD_OFFER');
    return selection.markNotOffered(p, ctx.params.applicationId);
  });
};
