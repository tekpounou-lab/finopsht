
import { Command, IUseCase, UseCaseResponse } from "../../types";
import { AttendanceRecord } from "../../../types";

export interface LogAttendanceCommand extends Command<{
  records: AttendanceRecord[];
}> {}

export class LogAttendanceUseCase implements IUseCase<LogAttendanceCommand, { count: number }> {
  constructor(
    private repositories: {
      attendance: any;
      audit: any;
    }
  ) {}

  async execute(command: LogAttendanceCommand): Promise<UseCaseResponse<{ count: number }>> {
    const { records } = command.payload;
    const { metadata } = command;

    try {
      // 1. Perspective Persistence - Call update once with the full array
      await this.repositories.attendance.update(records);

      // 2. Audit
      await this.repositories.audit.create({
        id: "flog_att_" + Math.random().toString(36).substring(2, 9),
        timestamp: new Date().toISOString(),
        userId: metadata.userId,
        userRole: metadata.role,
        business_id: metadata.business_id,
        action: "ATTENDANCE_LOGGED",
        details: `Logged ${records.length} attendance records`,
        severity: "info"
      });

      return {
        success: true,
        data: { count: records.length },
        events: [{
          type: "ATTENDANCE_UPDATED",
          payload: { count: records.length },
          occurredAt: new Date().toISOString(),
          business_id: metadata.business_id,
          correlationId: metadata.correlationId
        }]
      };
    } catch (error: any) {
      return {
        success: false,
        error: { code: "ATTENDANCE_ERROR", message: error.message }
      };
    }
  }
}
