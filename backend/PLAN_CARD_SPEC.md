# Plan Card — Exact Spec for Claude Code

Copy these snippets verbatim. Do not rewrite styles.

## Colors & tokens
- Coral primary: #FF6B4A
- Going pill: bg #E4F6EE · text #0E9C6B
- Late pill: bg #FBF0DA · text #C8841A
- Can't pill: bg #EFEBE7 · text #8A94A0
- Hosting badge: bg #FFE7E0 · text #E14F2E
- You're in badge: bg #E4F6EE · text #0E9C6B
- Maybe badge: bg #FBF0DA · text #C8841A
- Host chip (guest card): bg #F2EFEC · text #5B6770
- Group pill (host card): bg #FFEFE9 · text #FF6B4A
- Card bg: #FFFFFF · border: 1px solid #EBE4DC · border-radius: 22px
- Font headings: Fredoka 600 20px
- Font body: Plus Jakarta Sans

## Status pills rules
- Show green "X going" pill only if goingCount > 0
- Show amber "X late" pill only if lateCount > 0
- Show grey "X can't" pill only if cantCount > 0
- Never show a pill with 0 count
- Pills sit left-aligned; date/time sits right-aligned on same row

## Card: HOST plan
```
<div style="background:#fff;border:1px solid #EBE4DC;border-radius:22px;padding:17px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <span style="font-size:11px;font-weight:700;color:#FF6B4A;background:#FFEFE9;padding:5px 10px;border-radius:20px;font-family:'Plus Jakarta Sans'">
      {groupName}
    </span>
    <div style="display:flex;align-items:center;gap:7px">
      <span style="font-size:11px;font-weight:700;color:#E14F2E;background:#FFE7E0;padding:5px 10px;border-radius:20px;font-family:'Plus Jakarta Sans'">Hosting</span>
      <button onClick={onDelete} style="width:32px;height:32px;border-radius:10px;background:#FEF0EE;border:1px solid #FAD5CF;display:flex;align-items:center;justify-content:center;cursor:pointer">
        🗑 (red trash SVG)
      </button>
    </div>
  </div>
  <h4 style="margin:0 0 6px;font-family:'Fredoka';font-size:20px;font-weight:600;color:#1F2933">{title}</h4>
  <div style="display:flex;align-items:center;gap:6px;color:#7B7268;font-size:13.5px;margin-bottom:14px">
    📍 {place}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between">
    <div style="display:flex;gap:5px">
      {goingCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#0E9C6B;background:#E4F6EE;padding:4px 10px;border-radius:20px">{goingCount} going</span>}
      {lateCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#C8841A;background:#FBF0DA;padding:4px 10px;border-radius:20px">{lateCount} late</span>}
      {cantCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#8A94A0;background:#EFEBE7;padding:4px 10px;border-radius:20px">{cantCount} can't</span>}
    </div>
    <span style="font-size:12.5px;color:#9A9087;font-weight:600">{dateTime}</span>
  </div>
  {showCancelConfirm && (
    <div style="margin-top:13px;background:#FEF0EE;border:1px solid #FAD5CF;border-radius:13px;padding:12px 14px;display:flex;align-items:center;gap:10px">
      <span style="flex:1;font-size:13px;color:#E14F2E;font-weight:600">Cancel this plan? Everyone will be notified.</span>
      <button onClick={onConfirmDelete} style="background:#E14F2E;color:#fff;border:none;font-size:12px;font-weight:700;padding:8px 13px;border-radius:10px;cursor:pointer">Confirm</button>
      <button onClick={onKeep} style="background:#fff;color:#7B7268;border:1.5px solid #FAD5CF;font-size:12px;font-weight:600;padding:8px 12px;border-radius:10px;cursor:pointer">Keep</button>
    </div>
  )}
</div>
```

## Card: GUEST plan
```
<div style="background:#fff;border:1px solid #EBE4DC;border-radius:22px;padding:17px">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:7px;background:#F2EFEC;padding:5px 11px;border-radius:20px">
      <div style="width:18px;height:18px;border-radius:50%;background:{hostColor};display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700">{hostInitials}</div>
      <span style="font-size:12px;font-weight:600;color:#5B6770">by {hostName}</span>
    </div>
    <span style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:20px;
      color: rsvp=going ? #0E9C6B : rsvp=late ? #C8841A : #8A94A0;
      background: rsvp=going ? #E4F6EE : rsvp=late ? #FBF0DA : #EFEBE7">
      {rsvp=going ? "You're in" : rsvp=late ? "Going late" : "Can't make it"}
    </span>
  </div>
  <h4 style="margin:0 0 6px;font-family:'Fredoka';font-size:20px;font-weight:600;color:#1F2933">{title}</h4>
  <div style="display:flex;align-items:center;gap:6px;color:#7B7268;font-size:13.5px;margin-bottom:14px">
    📍 {place}
  </div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px">
    <div style="display:flex;gap:5px">
      {goingCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#0E9C6B;background:#E4F6EE;padding:4px 10px;border-radius:20px">{goingCount} going</span>}
      {lateCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#C8841A;background:#FBF0DA;padding:4px 10px;border-radius:20px">{lateCount} late</span>}
      {cantCount > 0 && <span style="font-size:11.5px;font-weight:700;color:#8A94A0;background:#EFEBE7;padding:4px 10px;border-radius:20px">{cantCount} can't</span>}
    </div>
    <span style="font-size:12.5px;color:#9A9087;font-weight:600">{dateTime}</span>
  </div>
  <button onClick={onEditRsvp} style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px;border:1.5px solid #EBE4DC;border-radius:13px;background:#FBF7F4;color:#1F2933;font-size:13px;font-weight:600;cursor:pointer">
    ✏️ Edit my response
  </button>
</div>
```

## Delete flow
1. Host taps trash icon → `showCancelConfirm = true` (shows inline confirm bar)
2. Host taps "Confirm" → delete plan from DB, remove from list, notify all invitees
3. Host taps "Keep" → `showCancelConfirm = false` (hides bar)
4. Deleting a plan sends a notification to all invitees: "{hostName} cancelled {planTitle}"
