'use strict';
// AuditService: append-only record of administrative actions (NFR-013), written inside the same
// transaction as the change it describes (D8).
const { auditToDTO } = require('./dto');

class AuditService {
  constructor(persistence) { this.p = persistence; }

  record(userId, actionType, details) {
    this.p.insertAudit({ action_type: actionType, performed_by: userId || null, details: details || null });
  }

  query(limit = 200) {
    return this.p.listAudit(Math.min(Math.max(Number(limit) || 200, 1), 1000)).map(auditToDTO);
  }
}

module.exports = { AuditService };
