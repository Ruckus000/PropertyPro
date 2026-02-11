/**
 * P0-03: Card component tests
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Card } from "../../src/components/Card";

describe("Card", () => {
  describe("Default rendering", () => {
    it("renders with base class contract", () => {
      render(<Card data-testid="card">content</Card>);
      const card = screen.getByTestId("card");

      expect(card.tagName).toBe("DIV");
      expect(card.className).toContain("pp-card");
      expect(card.className).toContain("flex");
      expect(card.className).toContain("rounded-[10px]");
      expect(card.className).toContain("border");
    });
  });

  describe("Size variants", () => {
    it("sm uses p-4 padding class", () => {
      render(
        <Card size="sm" data-testid="card">
          content
        </Card>,
      );
      expect(screen.getByTestId("card").className).toContain("p-4");
    });

    it("md uses p-5 padding class", () => {
      render(
        <Card size="md" data-testid="card">
          content
        </Card>,
      );
      expect(screen.getByTestId("card").className).toContain("p-5");
    });

    it("lg uses p-6 padding class", () => {
      render(
        <Card size="lg" data-testid="card">
          content
        </Card>,
      );
      expect(screen.getByTestId("card").className).toContain("p-6");
    });

    it("noPadding forces p-0", () => {
      render(
        <Card noPadding data-testid="card">
          content
        </Card>,
      );
      expect(screen.getByTestId("card").className).toContain("p-0");
    });
  });

  describe("Status and selection", () => {
    it("status adds left border class", () => {
      render(
        <Card status="success" data-testid="card">
          content
        </Card>,
      );
      const className = screen.getByTestId("card").className;
      expect(className).toContain("border-l-[3px]");
      expect(className).toContain("border-l-[var(--status-success)]");
    });

    it("selected adds selected classes", () => {
      render(
        <Card selected data-testid="card">
          content
        </Card>,
      );
      const className = screen.getByTestId("card").className;
      expect(className).toContain("bg-[var(--interactive-subtle)]");
      expect(className).toContain("border-[var(--interactive-primary)]");
    });
  });

  describe("Interactive behavior", () => {
    it("clicks when interactive and onClick provided", () => {
      const onClick = vi.fn();
      render(
        <Card interactive onClick={onClick} data-testid="card">
          content
        </Card>,
      );

      const card = screen.getByTestId("card");
      fireEvent.click(card);
      expect(onClick).toHaveBeenCalledTimes(1);
      expect(card.getAttribute("role")).toBe("button");
      expect(card.getAttribute("tabindex")).toBe("0");
      expect(card.className).toContain("pp-card--interactive");
      expect(card.className).toContain("cursor-pointer");
    });

    it("responds to Enter and Space", () => {
      const onClick = vi.fn();
      render(
        <Card interactive onClick={onClick} data-testid="card">
          content
        </Card>,
      );

      const card = screen.getByTestId("card");
      fireEvent.keyDown(card, { key: "Enter" });
      fireEvent.keyDown(card, { key: " " });
      expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("does not become keyboard-clickable without onClick", () => {
      render(
        <Card interactive data-testid="card">
          content
        </Card>,
      );

      const card = screen.getByTestId("card");
      expect(card.getAttribute("role")).toBeNull();
      expect(card.getAttribute("tabindex")).toBeNull();
    });
  });

  describe("Compound slots", () => {
    it("renders Header, Body, Footer, and Section", () => {
      render(
        <Card data-testid="card">
          <Card.Header data-testid="header">Header</Card.Header>
          <Card.Body data-testid="body">Body</Card.Body>
          <Card.Section data-testid="section">Section</Card.Section>
          <Card.Footer data-testid="footer">Footer</Card.Footer>
        </Card>,
      );

      expect(screen.getByTestId("header")).toBeTruthy();
      expect(screen.getByTestId("body")).toBeTruthy();
      expect(screen.getByTestId("section")).toBeTruthy();
      expect(screen.getByTestId("footer")).toBeTruthy();
    });

    it("uses p-0 when compound children are present", () => {
      render(
        <Card data-testid="card">
          <Card.Header>Header</Card.Header>
          <Card.Body>Body</Card.Body>
        </Card>,
      );

      expect(screen.getByTestId("card").className).toContain("p-0");
    });

    it("Card.Title and Card.Subtitle render semantic elements", () => {
      render(
        <Card>
          <Card.Header>
            <Card.Title data-testid="title">Title</Card.Title>
            <Card.Subtitle data-testid="subtitle">Subtitle</Card.Subtitle>
          </Card.Header>
        </Card>,
      );

      expect(screen.getByTestId("title").tagName).toBe("H3");
      expect(screen.getByTestId("subtitle").tagName).toBe("SPAN");
    });
  });

  describe("Dark mode classes", () => {
    it("base card includes explicit dark variants", () => {
      render(<Card data-testid="card">content</Card>);
      const className = screen.getByTestId("card").className;
      expect(className).toContain("dark:bg-gray-900");
      expect(className).toContain("dark:border-gray-700");
    });

    it("selected card includes explicit dark selected variants", () => {
      render(
        <Card selected data-testid="card">
          content
        </Card>,
      );
      const className = screen.getByTestId("card").className;
      expect(className).toContain("dark:bg-blue-950/30");
      expect(className).toContain("dark:border-blue-500");
    });
  });

  it("has correct displayName", () => {
    expect(Card.displayName).toBe("Card");
  });
});
