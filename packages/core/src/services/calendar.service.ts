const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id?: string;
  summary: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  description?: string;
  colorId?: string;
}

export interface GcalListItem {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export class CalendarService {
  /**
   * List events from Google Calendar for a date range.
   */
  async listEvents(
    token: string,
    timeMin: string,
    timeMax: string,
    calendarId = "primary"
  ): Promise<GcalListItem[]> {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await fetch(
      `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Calendar API error (${res.status}): ${body}`);
    }

    const data = await res.json();
    return data.items ?? [];
  }

  /**
   * Create an event on Google Calendar.
   */
  async createEvent(
    token: string,
    event: CalendarEvent,
    calendarId = "primary"
  ): Promise<{ id: string }> {
    const res = await fetch(
      `${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Google Calendar API error (${res.status}): ${body}`);
    }

    return res.json();
  }
}
