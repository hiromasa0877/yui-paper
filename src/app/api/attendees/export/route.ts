import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const ceremonyId = request.nextUrl.searchParams.get('ceremonyId');

    if (!ceremonyId) {
      return NextResponse.json(
        { error: 'Missing ceremonyId parameter' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('attendees')
      .select('*')
      .eq('ceremony_id', ceremonyId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    // Convert to CSV format
    const headers = [
      '氏名',
      '住所',
      '郵便番号',
      '電話',
      'ご関係',
      '香典金額',
      '香典番号',
      'チェックイン',
      '入場時刻',
    ];

    const rows = data.map((attendee) => [
      attendee.full_name,
      attendee.address || '',
      attendee.postal_code || '',
      attendee.phone || '',
      attendee.relation || '',
      attendee.koden_amount || '',
      attendee.koden_number || '',
      attendee.checked_in ? 'はい' : 'いいえ',
      attendee.checked_in_at
        ? new Date(attendee.checked_in_at).toLocaleString('ja-JP')
        : '',
    ]);

    // Create CSV content
    const csv = [headers, ...rows].map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    );

    const csvContent = csv.join('\n');

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv;charset=utf-8',
        'Content-Disposition': 'attachment; filename="attendees.csv"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
