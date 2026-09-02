import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
} from '@propertypro/design-system';

/**
 * CardDescription — the text-sm / content-secondary support line under a
 * CardTitle. It is the card's subtitle, not body copy: one or two lines that
 * say what the card is about before the content answers it.
 */

export const Default = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Meeting Notices</CardTitle>
      <CardDescription>
        Owner meetings require 14 days' notice; board meetings require 48 hours.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        Three notices are scheduled this month. PropertyPro posts each one to the
        community website and records the timestamp for the audit trail.
      </p>
    </CardContent>
  </Card>
);

export const Multiline = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Document Posting Window</CardTitle>
      <CardDescription>
        Associations with 25 or more units must maintain a website and post
        official records within 30 days of creation under §718.111(12)(g).
        PropertyPro measures the window from the document's creation date, not
        its upload date.
      </CardDescription>
    </CardHeader>
    <CardFooter className="gap-3">
      <Button size="sm">Review 4 pending documents</Button>
    </CardFooter>
  </Card>
);

export const WithoutDescription = () => (
  <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle>Assessment Ledger</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-content-secondary">
        With no CardDescription the header collapses to a single title line —
        useful for dense dashboard cards where the title is self-explanatory.
      </p>
    </CardContent>
  </Card>
);
